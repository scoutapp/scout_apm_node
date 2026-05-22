"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupErrorMonitoring = setupErrorMonitoring;
exports.captureError = captureError;
const os = __importStar(require("os"));
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
            // Re-throw so Node's default handler can run (prints stack, exits with code 1)
            throw err;
        });
        process.on("unhandledRejection", (reason) => {
            const err = reason instanceof Error ? reason : new Error(String(reason));
            captureError(err);
        });
    }
}
function captureError(error, opts) {
    if (!service || !currentConfig) {
        return;
    }
    const err = error instanceof Error ? error : new Error(String(error));
    const className = err.constructor ? err.constructor.name : "Error";
    if (ignoredExceptions.includes(className)) {
        return;
    }
    service.enqueue({
        exception_class: className,
        message: err.message || String(err),
        request_id: opts && opts.request ? opts.request.id : undefined,
        request_uri: opts && opts.request ? opts.request.url : undefined,
        request_params: (opts && opts.request && opts.request.params) ? opts.request.params : null,
        request_session: (opts && opts.request && opts.request.session) ? opts.request.session : null,
        environment: (opts && opts.environment) ? opts.environment : null,
        trace: parseStack(err),
        context: opts ? opts.context : undefined,
        host: currentConfig.hostname || os.hostname(),
        revision_sha: currentConfig.revisionSHA,
    });
}
function parseStack(error) {
    if (!error.stack) {
        return [];
    }
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
        .filter((s) => s !== null);
}
