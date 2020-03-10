"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
const stacktrace_js_1 = require("stacktrace-js");
const SUPPORTED_HTTP_METHODS = [
    "GET",
    "PUT",
    "POST",
    "DELETE",
    "PATCH",
];
// Hook into the express and mongodb module
class ExpressIntegration extends integrations_1.RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "express";
    }
    shim(expressExport) {
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
    shimExpressFn(fn) {
        return this.shim(fn);
    }
    /**
     * Shim express application creation
     *
     * @param {any} expressExport
     * @return {any} the modified express export
     */
    shimApplicationCreate(expressExport) {
        const integration = this;
        const originalFn = expressExport;
        expressExport = function () {
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
    shimHTTPMethod(method, app) {
        const integration = this;
        method = method.toLowerCase();
        const originalFn = app[method];
        // Replace the method
        app[method] = function () {
            const originalArgs = arguments;
            const originalArgsArr = Array.from(originalArgs);
            // Find the argument that is the handler
            const handlerIdx = originalArgsArr.findIndex(a => typeof a === "function");
            // If there's no handler we're in an unknown state
            if (handlerIdx < 0) {
                return originalFn.apply(this, originalArgsArr);
            }
            const handler = originalArgsArr[handlerIdx];
            // Capture the stack frames @ definition of the endpoint
            const framesAtHandlerCreation = stacktrace_js_1.getSync();
            // Shim the handler
            originalArgs[handlerIdx] = function () {
                // Gather a stacktrace from *inside* the handler, at execution time
                const framesAtExecution = stacktrace_js_1.getSync();
                // If no scout instance is available when the handler is executed,
                // then run original handler
                if (!integration.scout) {
                    return handler.apply(this, arguments);
                }
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
                }
                catch (err) {
                    // Get the current request if available
                    const currentRequest = integration.scout.getCurrentRequest();
                    if (currentRequest) {
                        // Mark the curernt request as errored
                        currentRequest.addContextSync(types_1.ScoutContextName.Error, "true");
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
exports.ExpressIntegration = ExpressIntegration;
exports.default = new ExpressIntegration();
