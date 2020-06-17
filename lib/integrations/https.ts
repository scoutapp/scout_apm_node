import * as path from "path";
import { HTTPIntegration } from "./http";
import { ClientRequest } from "http";
import { RequestOptions } from "https";
import { ExportBag, RequireIntegration } from "../types/integrations";
import { Scout, DoneCallback, ScoutSpan, ScoutRequest } from "../scout";
import { LogFn, LogLevel, ScoutContextName, ScoutSpanOperation } from "../types";
import * as Constants from "../constants";

// Hook into the express and mongodb module
export class HTTPSIntegration extends HTTPIntegration {
    protected readonly packageName: string = "https";

    protected shim(httpsExport: any): any {
        // Use the same exact shimming as HTTPS request
        httpsExport = this.shimHTTPRequest(httpsExport);

        // NOTE: Order here matters, the shimmed https.get depends on https.request already being shimmed
        httpsExport = this.shimHTTPSGet(httpsExport);

        return httpsExport;
    }

    /**
     * Shim for https's `get` function
     * `get` has to be shimmed because it uses the defined version of `request`
     * which is exported, but cannot be reassigned externally
     *
     * @param {any} httpsExport - https's export
     */
    private shimHTTPSGet(httpsExport: any): any {
        const integration = this;

        // https://github.com/nodejs/node/blob/master/lib/https.js#L315
        // Since the original function is so small we just replace it, making sure
        // to use the shiimmed version (on the export object)
        httpsExport.get = function(this: any) {
            const req = httpsExport.request.apply(this, arguments);
            req.end();
            return req;
        };

        return httpsExport;
    }

}

export default new HTTPSIntegration();
