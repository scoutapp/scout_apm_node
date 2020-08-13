import * as path from "path";
import { ClientRequest, RequestOptions } from "http";
import { ExportBag, RequireIntegration } from "../types/integrations";
import { Scout, DoneCallback, ScoutSpan, ScoutRequest } from "../scout";
import { LogFn, LogLevel, ScoutContextName, ScoutSpanOperation } from "../types";
import * as Constants from "../constants";

// Hook into the express and mongodb module
export class HTTPIntegration extends RequireIntegration {
    protected readonly packageName: string = "http";

    protected shim(httpExport: any): any {
        httpExport = this.shimHTTPRequest(httpExport);

        // NOTE: Order here matters, the shimmed http.get depends on http.request already being shimmed
        httpExport = this.shimHTTPGet(httpExport);

        return httpExport;
    }

    /**
     * Shim for http's `request` function
     *
     * @param {any} httpExport - http's export
     */
    protected shimHTTPRequest(httpExport: any): any {
        const originalFn = httpExport.request;
        const integration = this;

        const request = function(this: any) {
            const originalArgs = arguments;
            const originalArgsArr = Array.from(originalArgs);
            integration.logFn("[scout/integrations/http] requesting...", LogLevel.Trace);

            // If no scout instance is available then run the function normally
            if (!integration.scout) { return originalFn.apply(this, originalArgsArr); }

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
            const urlOrObject: string | URL | RequestOptions = originalArgsArr[0];
            if (typeof urlOrObject === "string") {
                method = "GET";
                url = originalArgsArr[0];
            } else if ("href" in urlOrObject) {
                method = "GET";
                url = urlOrObject.href;
            } else {
                method = urlOrObject.method || "Unknown";

                // Determine protocol, set to HTTPS if not present but port if 443
                let protocol = urlOrObject.protocol;
                if (!protocol) { protocol = urlOrObject.port === 443 ? "https" : "http"; }

                // Determine port, only show port if it's a non-standard port
                let port: string | number | null | undefined = urlOrObject.port;
                if (typeof port === "string") { port = parseInt(port, 10); }
                if (port && port === 443 || port === 80) { port = undefined; }

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
            let stopSpan: () => void = () => undefined;
            let reqSpan: ScoutSpan;

            integration.scout.instrument(opName, (stop, {span}) => {
                stopSpan = stop;

                if (!span) { return; }

                reqSpan = span;
                reqSpan.addContext(ScoutContextName.URL, url);
            });

            // Start the actual request
            const request: ClientRequest = originalFn.apply(this, originalArgsArr);

            // If the request times out at any point add the context to the span
            request.once("timeout", () => {
                if (reqSpan) {
                    reqSpan.addContext(ScoutContextName.Timeout, "true");
                }
            });

            // After the request has started we'll finish the instrumentation
            // this is in contrast to stopping only on close
            request.once("response", () => {
                stopSpan();
            });

            request.once("error", () => {
                if (reqSpan) {
                    reqSpan.addContext(ScoutContextName.Error, "true");
                }
            });

            request.once("close", () => {
                stopSpan();
            });

            return request;
        };

        httpExport.request = request;
        return httpExport;
    }

    /**
     * Shim for http's `get` function
     * `get` has to be shimmed because it uses the defined version of `request`
     * which is exported, but cannot be reassigned externally
     *
     * @param {any} httpExport - http's export
     */
    private shimHTTPGet(httpExport: any): any {
        const integration = this;

        // http://github.com/nodejs/node/blob/master/lib/http.js#L315
        // Since the original function is so small we just replace it, making sure
        // to use the shiimmed version (on the export object)
        httpExport.get = function(this: any) {
            const req = httpExport.request.apply(this, arguments);
            req.end();
            return req;
        };

        return httpExport;
    }

}

export default new HTTPIntegration();
