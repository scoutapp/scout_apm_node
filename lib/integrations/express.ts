import * as path from "path";
import { ExportBag, RequireIntegration, scoutIntegrationSymbol } from "../types/integrations";
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
        // Check if the shim has already been performed
        if (scoutIntegrationSymbol in expressExport) { return; }

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
        return expressExport;
    }

}

export default new ExpressIntegration();
