"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
// Hook into the express and mongodb module
class HTTPIntegration extends integrations_1.RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "http";
    }
    shim(httpExport) {
        httpExport = this.shimHTTPRequest(httpExport);
        return httpExport;
    }
    /**
     * Shim for http's `request` function
     *
     * @param {any} httpExport - http's export
     */
    shimHTTPRequest(httpExport) {
        const originalFn = httpExport.request;
        const integration = this;
        const request = function () {
            const originalArgs = arguments;
            const originalArgsArr = Array.from(originalArgs);
            integration.logFn("[scout/integrations/http] requesting...", types_1.LogLevel.Trace);
            // If no scout instance is available then run the function normally
            if (!integration.scout) {
                return originalFn.apply(this, originalArgsArr);
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
            else if ("href" in urlOrObject) {
                method = "GET";
                url = urlOrObject.href;
            }
            else {
                method = urlOrObject.method || "Unknown";
                // Determine protocol, set to HTTPS if not present but port if 443
                let protocol = urlOrObject.protocol;
                if (!protocol) {
                    protocol = urlOrObject.port === 443 ? "https" : "http";
                }
                // Determine port, only show port if it's a non-standard port
                let port = urlOrObject.port;
                if (typeof port === "string") {
                    port = parseInt(port, 10);
                }
                if (port && port === 443 || port === 80) {
                    port = undefined;
                }
                url = [
                    protocol,
                    "://",
                    urlOrObject.hostname || "localhost",
                    port ? `:${port}` : "",
                    urlOrObject.path,
                ].join("") || "Unknown";
            }
            // Start a scout instrumentation and pull out the stopSpan
            const opName = `HTTP/${method.toUpperCase()}`;
            // Start an asynchronous instrumentation and pull particulars from it
            let stopSpan = () => undefined;
            let reqSpan;
            integration.scout.instrument(opName, (stop, { span }) => {
                stopSpan = stop;
                if (!span) {
                    return;
                }
                reqSpan = span;
                reqSpan.addContext(types_1.ScoutContextName.URL, url);
            });
            // Start the actual request
            const request = originalFn.apply(this, originalArgsArr);
            // If the request times out at any point add the context to the span
            request.once("timeout", () => {
                reqSpan.addContext(types_1.ScoutContextName.Timeout, "true");
            });
            // After the request has started we'll finish the instrumentation
            // this is in contrast to stopping only on close
            request.once("response", () => {
                stopSpan();
            });
            request.once("error", () => {
                reqSpan.addContext(types_1.ScoutContextName.Error, "true");
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
exports.HTTPIntegration = HTTPIntegration;
exports.default = new HTTPIntegration();
