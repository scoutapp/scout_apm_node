import * as os from "os";
import { ScoutConfiguration } from "./types";
import { ErrorService, RequestComponents } from "./error-service";

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
            // Re-throw so Node's default handler can run (prints stack, exits with code 1)
            throw err;
        });

        process.on("unhandledRejection", (reason: any) => {
            const err = reason instanceof Error ? reason : new Error(String(reason));
            captureError(err);
        });
    }
}

export interface CaptureErrorOptions {
    request?: {
        id?: string;
        url?: string;
        params?: object;
        session?: object;
    };
    requestComponents?: RequestComponents;
    context?: object;
    environment?: object;
}

export function captureError(error: Error | any, opts?: CaptureErrorOptions): void {
    if (!service || !currentConfig) { return; }

    const err = error instanceof Error ? error : new Error(String(error));
    const className = err.constructor ? err.constructor.name : "Error";

    // Walk the prototype chain so subclasses of ignored exceptions are also suppressed,
    // matching Python's isinstance() behavior.
    if (isIgnored(err)) { return; }

    service.enqueue({
        exception_class: className,
        message: err.message || String(err),
        request_id: opts && opts.request ? opts.request.id : undefined,
        request_uri: opts && opts.request ? opts.request.url : undefined,
        request_params: (opts && opts.request && opts.request.params) ? opts.request.params : null,
        request_session: (opts && opts.request && opts.request.session) ? opts.request.session : null,
        environment: (opts && opts.environment) ? opts.environment : null,
        trace: parseStack(err),
        request_components: (opts && opts.requestComponents) ? opts.requestComponents : null,
        context: opts ? opts.context : undefined,
        host: (currentConfig.hostname as string) || os.hostname(),
        revision_sha: currentConfig.revisionSHA,
    });
}

// Walk the prototype chain so subclasses of ignored types are suppressed,
// matching Python's isinstance() behavior.
function isIgnored(err: Error): boolean {
    if (ignoredExceptions.length === 0) { return false; }
    let ctor = err.constructor as Function | null;
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

    // Skip the first line ("Error: message") and parse each "at" frame into
    // the Python convention: "file:line:in function", dropping node_modules frames.
    return error.stack
        .split("\n")
        .slice(1)
        .filter(line => !line.includes("node_modules"))
        .map(line => {
            const trimmed = line.trim();
            // "at functionName (file:line:col)" or "at Object.method (file:line:col)"
            const namedMatch = trimmed.match(/^at (.+?) \((.+?):(\d+):\d+\)$/);
            if (namedMatch) {
                return `${namedMatch[2]}:${namedMatch[3]}:in ${namedMatch[1]}`;
            }
            // "at file:line:col" (anonymous)
            const anonMatch = trimmed.match(/^at (.+?):(\d+):\d+$/);
            if (anonMatch) {
                return `${anonMatch[1]}:${anonMatch[2]}:in <anonymous>`;
            }
            return null;
        })
        .filter((s): s is string => s !== null);
}
