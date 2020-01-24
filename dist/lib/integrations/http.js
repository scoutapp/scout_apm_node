"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Hook = require("require-in-the-middle");
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
// Hook into the express and mongodb module
class HttpIntegration extends integrations_1.RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "http";
    }
    ritmHook(exportBag) {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // If the shim has already been run, then finish
            if (!exports || integrations_1.scoutIntegrationSymbol in exports) {
                return exports;
            }
            // Make changes to the http package to enable integration
            exports = this.shimHttp(exports);
            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;
            // Add the scoutIntegrationSymbol to the mysql export itself to show the shim was run
            exports[integrations_1.scoutIntegrationSymbol] = this;
            // Return the modified exports
            return exports;
        });
    }
    shimHttp(httpExport) {
        // Check if the shim has already been performed
        if (integrations_1.scoutIntegrationSymbol in httpExport) {
            return;
        }
        this.shimHttpRequest(httpExport);
        return httpExport;
    }
    /**
     * Shim for http's `request` function
     *
     * @param {any} httpExport - http's export
     */
    shimHttpRequest(httpExport) {
        const originalFn = httpExport.request;
        const integration = this;
        const request = function () {
            const originalArgs = arguments;
            const originalArgsArr = Array.from(originalArgs);
            integration.logFn("[scout/integrations/http] requesting...", types_1.LogLevel.Trace);
            // If no scout instance is available then run the function normally
            if (!integration.scout) {
                originalFn.apply(this, originalArgsArr);
            }
            // We need to find which one of the arguments was the callback (if there was one)
            // if one wasn't provided we'll use a do-nothing callback
            const cbIdx = originalArgsArr.findIndex(a => typeof a === "function");
            const cb = cbIdx >= 0 ? originalArgsArr[cbIdx] : () => undefined;
            // Create wrapped callback that we'll run instead
            const wrappedCb = function () {
                cb.apply(this, arguments);
            };
            // If there was no callback let's add one to the args
            if (cbIdx < 0) {
                originalArgsArr.push(wrappedCb);
            }
            else {
                originalArgsArr[cbIdx] = wrappedCb;
            }
            // Detect whether we're dealing with a url
            let method;
            let url;
            const urlOrObject = originalArgsArr[0];
            if (typeof urlOrObject === "string") {
                method = "GET";
                url = originalArgsArr[0];
            }
            else {
                method = urlOrObject.method || "Unknown";
                url = [
                    urlOrObject.hostname || "localhost",
                    ":",
                    urlOrObject.port,
                    urlOrObject.path,
                ].join("") || "Unknown";
            }
            // Start a scout instrumentation and pull out the stopSpan
            const opName = `HTTP/${method.toUpperCase()}`;
            // Start an asynchronous instrumentation and pull particulars from it
            let stopSpan;
            let reqSpan;
            integration.scout.instrument(opName, (stop, { span }) => {
                stopSpan = stop;
                if (!span) {
                    return;
                }
                reqSpan = span;
                reqSpan.addContext([{ name: types_1.ScoutContextNames.URL, value: url }]);
            });
            // Start the actual request
            const request = originalFn.apply(this, originalArgsArr);
            // If the request times out at any point add the context to the span
            request.once("timeout", () => {
                reqSpan.addContext([{ name: types_1.ScoutContextNames.Timeout, value: "true" }]);
            });
            // After the request has started we'll finish the instrumentation
            // this is in contrast to stopping only on close
            request.once("response", () => {
                stopSpan();
            });
            request.once("error", () => {
                reqSpan.addContext([{ name: types_1.ScoutContextNames.Error, value: "true" }]);
            });
            request.once("close", () => {
                stopSpan();
            });
            return request;
        };
        httpExport.request = request;
        return httpExport;
    }
}
exports.HttpIntegration = HttpIntegration;
exports.default = new HttpIntegration();
