import * as path from "path";
import { ClientRequest, RequestOptions } from "http";
import { ExportBag, RequireIntegration, scoutIntegrationSymbol } from "../types/integrations";
import { Scout, DoneCallback, ScoutSpan, ScoutRequest } from "../scout";
import { LogFn, LogLevel, ScoutContextName, ScoutSpanOperation } from "../types";
import * as Constants from "../constants";

// Hook into the express and mongodb module
export class HttpIntegration extends RequireIntegration {
    protected readonly packageName: string = "http";

    protected shim(httpExport: any): any {
        // Check if the shim has already been performed
        if (scoutIntegrationSymbol in httpExport) { return; }

        this.shimHttpRequest(httpExport);

        return httpExport;
    }

    /**
     * Shim for http's `request` function
     *
     * @param {any} httpExport - http's export
     */
    private shimHttpRequest(httpExport: any): any {
        const originalFn = httpExport.request;
        const integration = this;

        const request = function(this: any) {
            const originalArgs = arguments;
            const originalArgsArr = Array.from(originalArgs);
            integration.logFn("[scout/integrations/http] requesting...", LogLevel.Trace);

            // If no scout instance is available then run the function normally
            if (!integration.scout) { originalFn.apply(this, originalArgsArr); }

            // We need to find which one of the arguments was the callback (if there was one)
            // if one wasn't provided we'll use a do-nothing callback
            const cbIdx = originalArgsArr.findIndex(a => typeof a === "function");
            const cb = cbIdx >= 0 ? originalArgsArr[cbIdx] : () => undefined;

            // Create wrapped callback that we'll run instead
            const wrappedCb = function(this: any) {
                cb.apply(this, arguments);
            };

            // If there was no callback let's add one to the args
            if (cbIdx < 0) {
                originalArgsArr.push(wrappedCb);
            } else {
                originalArgsArr[cbIdx] = wrappedCb;
            }

            // Detect whether we're dealing with a url
            let method: string;
            let url: string;
            const urlOrObject: string | RequestOptions = originalArgsArr[0];
            if (typeof urlOrObject === "string") {
                method = "GET";
                url = originalArgsArr[0];
            } else {
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
            let stopSpan: () => void;
            let reqSpan: ScoutSpan;
            integration.scout.instrument(opName, (stop, {span}) => {
                stopSpan = stop;

                if (!span) { return; }

                reqSpan = span;
                reqSpan.addContext([{name: ScoutContextName.URL, value: url}]);
            });

            // Start the actual request
            const request: ClientRequest = originalFn.apply(this, originalArgsArr);

            // If the request times out at any point add the context to the span
            request.once("timeout", () => {
                reqSpan.addContext([{name: ScoutContextName.Timeout, value: "true"}]);
            });

            // After the request has started we'll finish the instrumentation
            // this is in contrast to stopping only on close
            request.once("response", () => {
                stopSpan();
            });

            request.once("error", () => {
                reqSpan.addContext([{name: ScoutContextName.Error, value: "true"}]);
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

export default new HttpIntegration();
