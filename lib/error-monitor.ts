import * as os from "os";
import { ScoutConfiguration } from "./types";
import { ErrorService } from "./error-service";
import { getActiveGlobalScoutInstance } from "./global";

let service: ErrorService | null = null;
let ignoredExceptions: string[] = [];
let currentConfig: Partial<ScoutConfiguration> | null = null;
let handlersInstalled = false;

export function setupErrorMonitoring(config: Partial<ScoutConfiguration>): void {
    if (config.errorsEnabled === false) { return; }
    if (!config.key || !config.name) { return; }

    currentConfig = config;
    ignoredExceptions = (config.errorsIgnoredExceptions as string[]) || [];

    if (service) { service.stop(); }
    service = new ErrorService(config);
    service.start();

    if (!handlersInstalled) {
        handlersInstalled = true;

        process.on("uncaughtException", (err: Error) => {
            captureError(err);
            throw err;
        });

        process.on("unhandledRejection", (reason: any) => {
            captureError(reason instanceof Error ? reason : new Error(String(reason)));
        });
    }
}

/**
 * Options for captureError. Mirrors the Ruby agent's ScoutApm::Error.capture signature:
 *   capture(error, context = {}, env: nil, name: nil)
 *
 * - controller / action / module: where the error "lives" (shown as location in APM).
 *   Express middleware fills these in automatically; pass overrides here to change them.
 * - name: override the exception class name shown in APM (useful for string errors or
 *   when you want a stable grouping name regardless of the class).
 * - requestId / requestUrl / requestParams / requestSession: request envelope data.
 *   Express middleware populates these from req; you can supply them manually too.
 */
export interface CaptureOptions {
    // Location — where the error lives in the app
    controller?: string | null;
    action?: string | null;
    module?: string | null;
    // Override the exception_class name shown in APM
    name?: string;
    // Request envelope (populated automatically by Express middleware)
    requestId?: string;
    requestUrl?: string;
    requestParams?: object;
    requestSession?: object;
}

/**
 * Report an error to Scout APM.
 *
 * @param error  - An Error object or a plain string message.
 * @param context - Flat key-value object of custom context data (shown alongside the error).
 * @param opts   - Optional location override and request envelope.
 *
 * @example
 * // Simple
 * captureError(new Error("Payment failed"))
 *
 * // With custom context
 * captureError(new Error("Payment failed"), { userId: req.user.id, plan: "pro" })
 *
 * // With explicit location (e.g. from a background job or non-Express handler)
 * captureError(new Error("Payment failed"), { orderId: 42 }, {
 *   controller: "CheckoutController",
 *   action: "process",
 * })
 */
export function captureError(
    error: Error | string | any,
    context?: Record<string, any>,
    opts?: CaptureOptions,
): void {
    if (!service || !currentConfig) { return; }

    const err = typeof error === "string"
        ? new Error(error)
        : error instanceof Error ? error : new Error(String(error));

    // If a string was passed, give it a stable default class name matching Ruby's convention
    const className = opts && opts.name
        ? opts.name
        : err.constructor && err.constructor.name
            ? err.constructor.name
            : "Error";

    if (isIgnored(err)) { return; }

    const scout = getActiveGlobalScoutInstance();
    const transactionId = scout?.getCurrentRequest()?.id ?? null;

    const mergedContext = transactionId
        ? { transaction_id: transactionId, ...(context || {}) }
        : context || undefined;

    const hasLocation = opts && (opts.controller != null || opts.action != null || opts.module != null);

    service.enqueue({
        exception_class: className,
        message: err.message || String(err),
        request_id: opts ? opts.requestId : undefined,
        request_uri: opts ? opts.requestUrl : undefined,
        request_params: (opts && opts.requestParams) ? opts.requestParams : null,
        request_session: (opts && opts.requestSession) ? opts.requestSession : null,
        environment: null,
        trace: parseStack(err),
        request_components: hasLocation ? {
            module: (opts && opts.module) ?? null,
            controller: (opts && opts.controller) ?? null,
            action: (opts && opts.action) ?? null,
        } : null,
        context: mergedContext,
        host: (currentConfig.hostname as string) || os.hostname(),
        revision_sha: currentConfig.revisionSHA,
    });
}

function isIgnored(err: Error): boolean {
    if (ignoredExceptions.length === 0) { return false; }
    let ctor = err.constructor as (new (...args: any[]) => any) | null;
    while (ctor && ctor.name) {
        if (ignoredExceptions.includes(ctor.name)) { return true; }
        const parent = Object.getPrototypeOf(ctor);
        if (!parent || parent === ctor) { break; }
        ctor = parent;
    }
    return false;
}

function parseStack(error: Error): string[] {
    if (!error.stack) { return []; }

    return error.stack
        .split("\n")
        .slice(1)
        .filter(line => !line.includes("node_modules"))
        .map(line => {
            const trimmed = line.trim();
            const namedMatch = trimmed.match(/^at (.+?) \((.+?):(\d+):\d+\)$/);
            if (namedMatch) {
                return `${namedMatch[2]}:${namedMatch[3]}:in ${namedMatch[1]}`;
            }
            const anonMatch = trimmed.match(/^at (.+?):(\d+):\d+$/);
            if (anonMatch) {
                return `${anonMatch[1]}:${anonMatch[2]}:in <anonymous>`;
            }
            return null;
        })
        .filter((s): s is string => s !== null);
}
