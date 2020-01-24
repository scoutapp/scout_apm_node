"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Hook = require("require-in-the-middle");
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
// Hook into the express and mongodb module
class NetIntegration extends integrations_1.RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "net";
    }
    ritmHook(exportBag) {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // If the shim has already been run, then finish
            if (!exports || integrations_1.scoutIntegrationSymbol in exports) {
                return exports;
            }
            // Make changes to the net package to enable integration
            exports = this.shimNet(exports);
            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;
            // Add the scoutIntegrationSymbol to the mysql export itself to show the shim was run
            exports[integrations_1.scoutIntegrationSymbol] = this;
            // Return the modified exports
            return exports;
        });
    }
    shimNet(netExport) {
        // Check if the shim has already been performed
        if (integrations_1.scoutIntegrationSymbol in netExport) {
            return;
        }
        this.shimNetConnect(netExport);
        return netExport;
    }
    /**
     * Shim for net's `connect` function
     *
     * @param {any} netExport - net's export
     */
    shimNetConnect(netExport) {
        const originalFn = netExport.createConnection;
        const integration = this;
        const createConnection = function () {
            const originalArgs = arguments;
            const originalArgsArr = Array.from(originalArgs);
            integration.logFn("[scout/integrations/net] connecting...", types_1.LogLevel.Debug);
            // If no scout instance is available then run the function normally
            console.log("integration.scout?", integration.scout);
            if (!integration.scout) {
                return originalFn.apply(null, originalArgs);
            }
            // Set up the modified callback
            const cbIdx = originalArgsArr.findIndex(a => typeof a === "function");
            // If a callback wasn't provided use a function that does nothing
            const originalCb = cbIdx >= 0 ? originalArgsArr[cbIdx] : () => undefined;
            let client;
            // TODO: Fish a method out of the options/request
            // If it's a unix connection then quit early
            const url = "url";
            const method = "get";
            const opName = `HTTP/${method.toUpperCase()}`;
            let stopSpan;
            let span;
            integration.scout.instrument(opName, (stop, spanAndRequest) => {
                span.addContext([{ name: types_1.ScoutContextNames.URL, value: url }]);
                // Start an instrumentation, but don't finish it
                stopSpan = stop;
                if (!spanAndRequest.span) {
                    return;
                }
                span = spanAndRequest.span;
            });
            console.log("STARTED INSTRUMENT");
            // Build a modified callback to use
            const modifiedCb = () => {
                // if somehow the client is not set by this point exit early
                if (!client) {
                    originalCb();
                    return;
                }
                // If there was an original callback specified run it
                originalCb();
            };
            // Replace the original callback with the modified version, if there was one
            // if there wasn't a callback to start with then add one
            if (originalCb) {
                originalArgsArr[cbIdx] = modifiedCb;
            }
            else {
                originalArgsArr.push(modifiedCb);
            }
            // Create the client
            client = originalFn.apply(null, originalArgsArr);
            // If the request times out at any point add the context to the span
            client.once("timeout", () => {
                span.addContext([{ name: types_1.ScoutContextNames.Timeout, value: "true" }]);
            });
            client.once("end", () => {
                console.log("END?!");
            });
            // NOTE: this is when both the other side has sent a FIN and our side has sent a FIN
            client.once("close", (hadError) => {
                let markError = () => Promise.resolve(span);
                // Add error tag, if hadError is true
                if (hadError) {
                    markError = () => span.addContext([{ name: types_1.ScoutContextNames.Error, value: "true" }]);
                }
                console.log("CLOSING!");
                // Close the span, marking the error if necessary
                markError()
                    .then(() => stopSpan());
            });
            return client;
        };
        netExport.createConnection = createConnection;
        return netExport;
    }
}
exports.NetIntegration = NetIntegration;
exports.default = new NetIntegration();
