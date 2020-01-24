"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Hook = require("require-in-the-middle");
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
// Hook into the express and mongodb module
class NodeJSNetIntegration extends integrations_1.RequireIntegration {
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
            exports = this.shimNodeJSNet(exports);
            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;
            // Add the scoutIntegrationSymbol to the mysql export itself to show the shim was run
            exports[integrations_1.scoutIntegrationSymbol] = this;
            // Return the modified exports
            return exports;
        });
    }
    shimNodeJSNet(netExport) {
        // Check if the shim has already been performed
        if (integrations_1.scoutIntegrationSymbol in netExport) {
            return;
        }
        this.shimNodeJSNetConnect(netExport);
        return netExport;
    }
    /**
     * Shim for net's `connect` function
     *
     * @param {any} netExport - net's export
     */
    shimNodeJSNetConnect(netExport) {
        const originalFn = netExport.connect;
        const integration = this;
        const connect = function () {
            const originalArgs = arguments;
            const originalArgsArr = Array.from(originalArgs);
            integration.logFn("[scout/integrations/net] connecting...", types_1.LogLevel.Debug);
            // Set up the modified callback
            const cbIdx = originalArgsArr.findIndex(a => typeof a === "function");
            // If a callback wasn't provided use a function that does nothing
            const originalCb = cbIdx >= 0 ? originalArgsArr[cbIdx] : () => undefined;
            let client;
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
            // Hook up handlers
            client.once("end", () => {
                // Close the span
            });
            client.once("timeout", () => {
                // Add timeout tag
            });
            client.once("error", () => {
                // Add error tag
                // Close the span
            });
            client.once("close", () => {
                // Add error tag
                // Close the span
            });
            return client;
            // // Set up
            // // If no scout instance is available then run the function normally
            // if (!integration.scout) { return originalFn(src, options, callback); }
            // return integration.scout.instrument(ScoutSpanOperation.TemplateConnect, (spanDone, {span}) => {
            //     span.addContextSync([{name: ScoutContextNames.Name, value: "<string>"}]);
            //     return originalFn(src, options, callback);
            // });
        };
        netExport.connect = connect;
        return netExport;
    }
}
exports.NodeJSNetIntegration = NodeJSNetIntegration;
exports.default = new NodeJSNetIntegration();
