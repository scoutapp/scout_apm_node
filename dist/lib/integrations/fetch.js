"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const diagnostics_channel_1 = require("diagnostics_channel");
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
class FetchIntegration extends integrations_1.RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "fetch";
        this.subscribed = false;
        this.pending = new WeakMap();
    }
    // diagnostics_channel fires for all undici usage, including Node 18+ native fetch.
    // We override ritmHook to skip RITM entirely and subscribe at setup time instead.
    ritmHook(exportBag) {
        const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
        if (nodeMajor < 18) {
            this.logFn("[scout/integrations/fetch] Node < 18, skipping", types_1.LogLevel.Debug);
            return;
        }
        this.subscribe();
    }
    // Required by RequireIntegration but never called — we bypass RITM.
    shim(e) { return e; }
    subscribe() {
        if (this.subscribed) {
            return;
        }
        this.subscribed = true;
        const integration = this;
        // Fired when fetch/undici creates a new outgoing request.
        // At this point we are still in the caller's async context, so
        // AsyncLocalStorage carries the active Scout span correctly.
        diagnostics_channel_1.channel("undici:request:create").subscribe((msg) => {
            const { request } = msg;
            if (!integration.scout || !request) {
                return;
            }
            const method = (request.method || "GET").toUpperCase();
            // When using a ProxyAgent for HTTPS, undici fires undici:request:create
            // for the CONNECT tunnel setup but NOT for the actual tunneled request.
            // We reconstruct the target URL from the CONNECT path ("host:port") and
            // emit it as HTTP/GET so APM sees the real destination.
            let url;
            let spanMethod;
            if (method === "CONNECT") {
                const host = (request.path || "").split(":")[0];
                url = host ? `https://${host}/` : "Unknown";
                spanMethod = "GET";
            }
            else {
                const rawUrl = `${request.origin}${request.path}`;
                try {
                    url = new URL(rawUrl).toString();
                }
                catch (_a) {
                    url = rawUrl || "Unknown";
                }
                spanMethod = method;
            }
            integration.scout.instrument(`HTTP/${spanMethod}`, (done, { span }) => {
                integration.pending.set(request, { done, span: (span !== null && span !== void 0 ? span : null) });
                if (span) {
                    span.addContext(types_1.ScoutContextName.URL, url);
                }
            });
        });
        // Fired when response headers arrive. This is the earliest reliable
        // point to close the span — the response body may still be streaming.
        diagnostics_channel_1.channel("undici:request:headers").subscribe((msg) => {
            const { request } = msg;
            const entry = integration.pending.get(request);
            if (!entry) {
                return;
            }
            integration.pending.delete(request);
            entry.done();
            integration.logFn("[scout/integrations/fetch] request completed", types_1.LogLevel.Trace);
        });
        // Fired when the request fails (network error, timeout, etc.).
        diagnostics_channel_1.channel("undici:request:error").subscribe((msg) => {
            const { request } = msg;
            const entry = integration.pending.get(request);
            if (!entry) {
                return;
            }
            integration.pending.delete(request);
            if (entry.span) {
                entry.span.addContext(types_1.ScoutContextName.Error, "true");
            }
            entry.done();
        });
    }
}
exports.FetchIntegration = FetchIntegration;
exports.default = new FetchIntegration();
