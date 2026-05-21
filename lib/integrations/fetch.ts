import { channel } from "diagnostics_channel";
import { RequireIntegration, ExportBag } from "../types/integrations";
import { LogLevel, ScoutContextName } from "../types";
import { ScoutSpan } from "../scout";

// Correlates an undici request object to its open Scout span and done callback.
// Keyed by the request object itself so the entry is GC'd if the request is abandoned.
interface PendingEntry {
    done: () => void;
    span: ScoutSpan | null;
}

export class FetchIntegration extends RequireIntegration {
    protected readonly packageName: string = "fetch";
    private subscribed = false;
    private readonly pending = new WeakMap<object, PendingEntry>();

    // diagnostics_channel fires for all undici usage, including Node 18+ native fetch.
    // We override ritmHook to skip RITM entirely and subscribe at setup time instead.
    public ritmHook(_exportBag: ExportBag): void {
        const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
        if (nodeMajor < 18) {
            this.logFn("[scout/integrations/fetch] Node < 18, skipping", LogLevel.Debug);
            return;
        }
        this.subscribe();
    }

    // Required by RequireIntegration but never called — we bypass RITM.
    protected shim(e: any): any { return e; }

    private subscribe(): void {
        if (this.subscribed) { return; }
        this.subscribed = true;

        const integration = this;

        // Fired when fetch/undici creates a new outgoing request.
        // At this point we are still in the caller's async context, so
        // AsyncLocalStorage carries the active Scout span correctly.
        channel("undici:request:create").subscribe((msg: any) => {
            const { request } = msg;
            if (!integration.scout || !request) { return; }

            const method = (request.method || "GET").toUpperCase();

            // CONNECT is a proxy tunnel setup request, not an application HTTP call.
            // Instrumenting it would produce a garbled URL (proxy host + tunnel target
            // concatenated) and a misleading HTTP/CONNECT span in APM.
            if (method === "CONNECT") { return; }

            const rawUrl = `${request.origin}${request.path}`;
            let url: string;
            try {
                url = new URL(rawUrl).toString();
            } catch {
                url = rawUrl || "Unknown";
            }

            integration.scout.instrument(`HTTP/${method}`, (done, { span }) => {
                integration.pending.set(request, { done, span: span ?? null });
                if (span) {
                    span.addContext(ScoutContextName.URL, url);
                }
            });
        });

        // Fired when response headers arrive. This is the earliest reliable
        // point to close the span — the response body may still be streaming.
        channel("undici:request:headers").subscribe((msg: any) => {
            const { request } = msg;
            const entry = integration.pending.get(request);
            if (!entry) { return; }

            integration.pending.delete(request);
            entry.done();
            integration.logFn("[scout/integrations/fetch] request completed", LogLevel.Trace);
        });

        // Fired when the request fails (network error, timeout, etc.).
        channel("undici:request:error").subscribe((msg: any) => {
            const { request } = msg;
            const entry = integration.pending.get(request);
            if (!entry) { return; }

            integration.pending.delete(request);
            if (entry.span) { entry.span.addContext(ScoutContextName.Error, "true"); }
            entry.done();
        });
    }
}

export default new FetchIntegration();
