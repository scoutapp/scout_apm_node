import * as path from "path";
import { Express, Application } from "express";

import { ExportBag, RequireIntegration } from "../types/integrations";
import { Scout } from "../scout";
import { LogFn, LogLevel, ScoutContextName, ScoutSpanOperation, ExpressFn } from "../types";
import * as Constants from "../constants";

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

            // Shim the handler
            originalArgs[handlerIdx] = function(this: any) {
                // If no scout instance is available when the handler is executed,
                // then run original handler
                if (!integration.scout) { return handler.apply(this, originalArgsArr); }

                try {
                    return handler.apply(this, arguments);
                } catch (err) {
                    // Get the current request if available
                    const currentRequest = integration.scout.getCurrentRequest();
                    if (currentRequest) {
                        // Mark the curernt request as errored
                        currentRequest.addContextSync({name: ScoutContextName.Error, value: "true"});
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
