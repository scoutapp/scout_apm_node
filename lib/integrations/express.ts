import * as path from "path";
import { Express, Application } from "express";

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

// Hook into the express and mongodb module
export class ExpressIntegration extends RequireIntegration {
    protected readonly packageName: string = "express";

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
                        // Mark the curernt request as errored
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
