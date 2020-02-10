"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const integrations_1 = require("../types/integrations");
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
    shimHTTPMethod(method, expressExport) {
        return expressExport;
    }
}
exports.ExpressIntegration = ExpressIntegration;
exports.default = new ExpressIntegration();
