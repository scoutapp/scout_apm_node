"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("./http");
// Hook into the express and mongodb module
class HTTPSIntegration extends http_1.HTTPIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "https";
    }
    shim(httpsExport) {
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
    shimHTTPSGet(httpsExport) {
        const integration = this;
        // https://github.com/nodejs/node/blob/master/lib/https.js#L315
        // Since the original function is so small we just replace it, making sure
        // to use the shiimmed version (on the export object)
        httpsExport.get = function () {
            const req = httpsExport.request.apply(this, arguments);
            req.end();
            return req;
        };
        return httpsExport;
    }
}
exports.HTTPSIntegration = HTTPSIntegration;
exports.default = new HTTPSIntegration();
