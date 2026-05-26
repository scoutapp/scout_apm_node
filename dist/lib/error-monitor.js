"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const os = require("os");
const error_service_1 = require("./error-service");
let service = null;
let ignoredExceptions = [];
let currentConfig = null;
let handlersInstalled = false;
function setupErrorMonitoring(config) {
    if (config.errorsEnabled === false) {
        return;
    }
    if (!config.key || !config.name) {
        return;
    }
    currentConfig = config;
    ignoredExceptions = config.errorsIgnoredExceptions || [];
    if (service) {
        service.stop();
    }
    service = new error_service_1.ErrorService(config);
    service.start();
    if (!handlersInstalled) {
        handlersInstalled = true;
        process.on("uncaughtException", (err) => {
            captureError(err);
            throw err;
        });
        process.on("unhandledRejection", (reason) => {
            captureError(reason instanceof Error ? reason : new Error(String(reason)));
        });
    }
}
exports.setupErrorMonitoring = setupErrorMonitoring;
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
function captureError(error, context, opts) {
    var _a, _b, _c;
    if (!service || !currentConfig) {
        return;
    }
    const err = typeof error === "string"
        ? new Error(error)
        : error instanceof Error ? error : new Error(String(error));
    // If a string was passed, give it a stable default class name matching Ruby's convention
    const className = opts && opts.name
        ? opts.name
        : err.constructor && err.constructor.name
            ? err.constructor.name
            : "Error";
    if (isIgnored(err)) {
        return;
    }
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
            module: (_a = (opts && opts.module), (_a !== null && _a !== void 0 ? _a : null)),
            controller: (_b = (opts && opts.controller), (_b !== null && _b !== void 0 ? _b : null)),
            action: (_c = (opts && opts.action), (_c !== null && _c !== void 0 ? _c : null)),
        } : null,
        context: context || undefined,
        host: currentConfig.hostname || os.hostname(),
        revision_sha: currentConfig.revisionSHA,
    });
}
exports.captureError = captureError;
function isIgnored(err) {
    if (ignoredExceptions.length === 0) {
        return false;
    }
    let ctor = err.constructor;
    while (ctor && ctor.name) {
        if (ignoredExceptions.includes(ctor.name)) {
            return true;
        }
        const parent = Object.getPrototypeOf(ctor);
        if (!parent || parent === ctor) {
            break;
        }
        ctor = parent;
    }
    return false;
}
function parseStack(error) {
    if (!error.stack) {
        return [];
    }
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
        .filter((s) => s !== null);
}
