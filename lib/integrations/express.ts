import * as path from "path";
import { ExportBag, RequireIntegration } from "../types/integrations";
import { Scout } from "../scout";
import { Express } from "express";
import { LogFn, LogLevel, ScoutContextName, ScoutSpanOperation } from "../types";
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
        // Shim all the HTTP methods
        SUPPORTED_HTTP_METHODS.forEach(m => this.shimHTTPMethod(m, expressExport));

        return expressExport;
    }

    /**
     * Shim an individual HTTP method for express
     *
     * @param {string} method - the HTTP method (ex. "GET")
     * @param {any} expressExport - the express export
     * @returns {any} the modified express export
     */
    private shimHTTPMethod(method: string, expressExport: any): any {
        method = method.toLowerCase();

        const originalFn = expressExport[method];

        // Replace the method
        expressExport[method] = function(this: any) {
            try {
                return originalFn(...arguments);
            } catch (err) {
                // Get the current request if available
                const currentRequest = this.getCurrentRequest();
                if (currentRequest) {
                    // Mark the curernt request as errored
                    currentRequest.addContextSync([{ name: ScoutContextName.Error, value: "true" }]);
                }

                // Rethrow the original error
                throw err;
            }
        };

        return expressExport;
    }
}

export default new ExpressIntegration();
