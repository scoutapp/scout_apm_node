import * as path from "path";
import * as Hook from "require-in-the-middle";
import { Socket } from "net";
import { ExportBag, RequireIntegration, scoutIntegrationSymbol } from "../types/integrations";
import { Scout } from "../scout";
import { LogFn, LogLevel, ScoutContextNames, ScoutSpanOperation } from "../types";
import * as Constants from "../constants";

// Hook into the express and mongodb module
export class NetIntegration extends RequireIntegration {
    protected readonly packageName: string = "net";

    public ritmHook(exportBag: ExportBag): void {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // If the shim has already been run, then finish
            if (!exports || scoutIntegrationSymbol in exports) {
                return exports;
            }

            // Make changes to the net package to enable integration
            exports = this.shimNet(exports);

            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;

            // Add the scoutIntegrationSymbol to the mysql export itself to show the shim was run
            exports[scoutIntegrationSymbol] = this;

            // Return the modified exports
            return exports;
        });
    }

    private shimNet(netExport: any): any {
        // Check if the shim has already been performed
        if (scoutIntegrationSymbol in netExport) { return; }

        this.shimNetConnect(netExport);

        return netExport;
    }

    /**
     * Shim for net's `connect` function
     *
     * @param {any} netExport - net's export
     */
    private shimNetConnect(netExport: any): any {
        const originalFn = netExport.connect;
        const integration = this;

        const connect = function() {
            const originalArgs = arguments;
            const originalArgsArr = Array.from(originalArgs);
            integration.logFn("[scout/integrations/net] connecting...", LogLevel.Debug);

            // Set up the modified callback
            const cbIdx = originalArgsArr.findIndex(a => typeof a === "function");
            // If a callback wasn't provided use a function that does nothing
            const originalCb = cbIdx >= 0 ? originalArgsArr[cbIdx] : () => undefined;

            let client: Socket;

            // TODO: Fish a method out of the options/request
            // If it's a unix connection then quit early

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
            } else {
                originalArgsArr.push(modifiedCb);
            }

            // Create the client
            client = originalFn.apply(null, originalArgsArr);

            client.once("timeout", () => {
                // Add timeout tag
            });

            // NOTE: this is when both the other side has sent a FIN and our side has sent a FIN
            client.once("close", (hadError) => {
                // Add error tag, if hadError is true
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

export default new NetIntegration();
