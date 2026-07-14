import * as path from "path";
import { Express, Application } from "express";
import * as Hook from "require-in-the-middle";

import { ExportBag, RequireIntegration } from "../types/integrations";
import { Scout } from "../scout";
import { LogFn, LogLevel, ScoutContextName, ScoutSpanOperation, ExpressFn } from "../types";
import * as Constants from "../constants";

import {
    getSync as getStackTraceSync,
} from "stacktrace-js";

const SUPPORTED_HTTP_METHODS = [
    "GET",
    "PUT",
    "POST",
    "DELETE",
    "PATCH",
];

// Express-internal layer names that should never generate spans
const INTERNAL_LAYER_NAMES = new Set(["query", "expressInit"]);
// bound* names come from Express's internal .bind() calls (e.g. "bound dispatch")
const INTERNAL_LAYER_NAME_PREFIX = "bound ";

// Hook into the express and mongodb module
export class ExpressIntegration extends RequireIntegration {
    protected readonly packageName: string = "express";

    public ritmHook(exportBag: ExportBag): void {
        super.ritmHook(exportBag);
        this.hookExpressLayer();
    }

    private hookExpressLayer(): void {
        const integration = this;

        new Hook(["express/lib/router/layer"], (exports: any) => {
            const original = exports.prototype.handle_request;

            exports.prototype.handle_request = function handle_request(req: any, res: any, next: Function) {
                const scout = integration.scout;
                if (!scout) { return original.apply(this, arguments); }

                const fnName: string | undefined = this.handle && this.handle.name;

                // Skip internal Express layers (query, expressInit, bound dispatch, etc.)
                if (fnName && (INTERNAL_LAYER_NAMES.has(fnName) || fnName.startsWith(INTERNAL_LAYER_NAME_PREFIX))) {
                    return original.apply(this, arguments);
                }

                // Skip anonymous/unnamed middleware unless configured otherwise
                const config = scout.getConfig();
                const instrumentAnon = config && config.expressInstrumentAnonymousMiddleware;
                if (!fnName && !instrumentAnon) {
                    return original.apply(this, arguments);
                }

                const operation = `Middleware/${fnName || "anonymous"}`;
                const startMs = Date.now();

                let spanDone: () => void = () => undefined;
                let spanEnded = false;

                const endSpan = () => {
                    if (spanEnded) { return; }
                    spanEnded = true;
                    const minDuration = (config && config.expressMiddlewareMinDurationMs) || 0;
                    if (minDuration > 0 && (Date.now() - startMs) < minDuration) {
                        spanDone();
                        return;
                    }
                    spanDone();
                };

                const wrappedNext = function(this: any) {
                    endSpan();
                    return next.apply(this, arguments);
                };

                scout.instrument(operation, (done: any) => {
                    spanDone = done;
                    res.once("finish", endSpan);
                    return original.apply(this, [req, res, wrappedNext]);
                });
            };

            return exports;
        });
    }

    protected shim(expressExport: any): any {
        // Shim application creation
        expressExport = this.shimApplicationCreate(expressExport);

        return expressExport;
    }

    /**
     * Shim an existing express object
     *
     * @param {Function} fn - express function (default export)
     * @returns {Function} the modified (shimmed) express function
     */
    public shimExpressFn(fn: ExpressFn): ExpressFn {
        return this.shim(fn);
    }

    /**
     * Shim express application creation
     *
     * @param {any} expressExport
     * @return {any} the modified express export
     */
    private shimApplicationCreate(expressExport: any): any {
        const integration = this;

        const originalFn = expressExport;

        expressExport = function(this: any) {
            let app = originalFn.apply(this, arguments);

            // Shim all the HTTP methods
            SUPPORTED_HTTP_METHODS.forEach(m => {
                app = integration.shimHTTPMethod(m, app);
            });

            return app;
        };

        // Add all the properties that express normally has on the express fn export
        Object.assign(expressExport, originalFn);

        return expressExport;
    }

    /**
     * Shim an individual HTTP method for express
     *
     * @param {string} method - the HTTP method (ex. "GET")
     * @param {Application} app - the express app
     * @returns {any} the modified express export
     */
    private shimHTTPMethod(method: string, app: Application): Application {
        const integration = this;
        method = method.toLowerCase();

        const originalFn = app[method];

        // Replace the method
        app[method] = function(this: any) {
            const originalArgs = arguments;
            const originalArgsArr = Array.from(originalArgs);

            // Find the argument that is the handler
            const handlerIdx = originalArgsArr.findIndex(a => typeof a === "function");
            // If there's no handler we're in an unknown state
            if (handlerIdx < 0) { return originalFn.apply(this, originalArgsArr); }

            const handler = originalArgsArr[handlerIdx];

            // Capture the stack frames @ definition of the endpoint
            const framesAtHandlerCreation = getStackTraceSync();

            // Shim the handler
            originalArgs[handlerIdx] = function(this: any) {
                // Gather a stacktrace from *inside* the handler, at execution time
                const framesAtExecution = getStackTraceSync();

                // If no scout instance is available when the handler is executed,
                // then run original handler
                if (!integration.scout) { return handler.apply(this, arguments); }

                // If we are inside a span, save the build frames to the span
                // (they will be sent out if the operation takes too long)
                const span = integration.scout.getCurrentSpan();
                if (span) {
                    // Traces from creation time go first since that's where the handler was defined
                    span.pushTraceFrames(framesAtHandlerCreation);
                    span.pushTraceFrames(framesAtExecution);
                }

                try {
                    return handler.apply(this, arguments);
                } catch (err) {
                    // Get the current request if available
                    const currentRequest = integration.scout.getCurrentRequest();
                    if (currentRequest) {
                        // Mark the current request as errored
                        currentRequest.addContextSync(ScoutContextName.Error, "true");
                    }

                    // Rethrow the original error
                    throw err;
                }
            };

            return originalFn.apply(this, originalArgs);

        };

        return app;
    }

}

export default new ExpressIntegration();
