"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaIntegration = void 0;
const async_hooks_1 = require("async_hooks");
const crypto_1 = require("crypto");
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
class PrismaIntegration extends integrations_1.RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "@prisma/client";
    }
    shim(prismaExport) {
        const majorVersion = this.getPrismaMajorVersion(prismaExport);
        if (majorVersion >= 6) {
            // Prisma 6+ exposes a global contract: before every query it calls
            // getGlobalTracingHelper() which checks globalThis.PRISMA_INSTRUMENTATION.
            // Registering our helper there is all that's needed — no class patching.
            this.registerTracingHelper(majorVersion);
        }
        // Prisma < 6: no-op. Return the export untouched.
        return prismaExport;
    }
    getPrismaMajorVersion(prismaExport) {
        try {
            const version = prismaExport?.Prisma?.prismaVersion?.client ?? "";
            return parseInt(version.split(".")[0], 10) || 0;
        }
        catch {
            return 0;
        }
    }
    // -------------------------------------------------------------------------
    // Prisma 6+ — TracingHelper global contract
    //
    // Prisma 6 checks two globals before each query (from instrumentation-contract):
    //   1. globalThis[`V${major}_PRISMA_INSTRUMENTATION`]  (versioned, checked first)
    //   2. globalThis["PRISMA_INSTRUMENTATION"]            (fallback)
    //
    // Our helper implements the same TracingHelper interface as ActiveTracingHelper
    // in @prisma/instrumentation, but without the OTel dependency.
    //
    // runInChildSpan is called by Prisma for every internal span. We only create
    // a Scout span for name === 'operation' (the top-level user-facing call).
    // dispatchEngineSpans receives the full engine trace tree after SQL execution;
    // we extract db.statement from the prisma:engine:db_query span and write it
    // back via AsyncLocalStorage — which works here because dispatchEngineSpans
    // is called within the same Promise chain as runInChildSpan (unlike the
    // $on('query') event which fires from a libuv I/O callback).
    // -------------------------------------------------------------------------
    registerTracingHelper(majorVersion) {
        const integration = this;
        const storage = new async_hooks_1.AsyncLocalStorage();
        const helper = {
            isEnabled: () => true,
            // Prisma injects this traceparent into the SQL connection for engine-level
            // span collection. We return a unique sampled traceparent per operation
            // (stored in AsyncLocalStorage by runInChildSpan) so the Rust engine
            // enables its internal tracing and trace() returns spans with db.statement.
            // Outside of an active operation we return the no-op sentinel.
            getTraceParent: (_ctx) => {
                return storage.getStore()?.traceparent ?? "00-10-10-00";
            },
            // OTel context plumbing — not needed without an OTel SDK.
            getActiveContext: () => ({}),
            runInChildSpan(nameOrOpts, callback) {
                const opts = typeof nameOrOpts === "string" ? { name: nameOrOpts } : nameOrOpts;
                // Prisma calls this for serialize, deserialize, connect, etc.
                // Only 'operation' maps to a user-facing query we want to surface.
                if (opts.name !== "operation" || !integration.scout) {
                    return callback();
                }
                // Generate a valid sampled W3C traceparent for this operation.
                // This causes the Rust engine to collect internal spans and return
                // them via trace(requestId), which feeds dispatchEngineSpans.
                const traceparent = `00-${(0, crypto_1.randomBytes)(16).toString("hex")}-${(0, crypto_1.randomBytes)(8).toString("hex")}-01`;
                const sqlStore = { sql: null, traceparent };
                return integration.scout.instrument(types_1.ScoutSpanOperation.SQLQuery, async (done) => {
                    const span = integration.scout?.getCurrentSpan() ?? null;
                    try {
                        // Run the Prisma operation inside the AsyncLocalStorage context.
                        // dispatchEngineSpans fires within this same Promise chain and
                        // writes the SQL back into sqlStore via storage.getStore().
                        const result = await storage.run(sqlStore, () => callback());
                        if (span) {
                            await span.addContext(types_1.ScoutContextName.DBStatement, sqlStore.sql ?? "(unknown)");
                        }
                        done();
                        integration.logFn(`[scout/integrations/prisma] operation completed`, types_1.LogLevel.Trace);
                        return result;
                    }
                    catch (err) {
                        done();
                        if (span) {
                            span.addContext(types_1.ScoutContextName.Error, "true");
                        }
                        throw err;
                    }
                });
            },
            // Called by Prisma after the engine executes SQL. spans contains the
            // full trace tree; prisma:engine:db_query carries the raw parameterized
            // SQL. Prisma 6.19+ uses db.query.text (updated OTel semconv); older
            // Prisma 6.x used db.statement. Check both.
            dispatchEngineSpans(spans) {
                const dbQuery = spans.find(s => s.name === "prisma:engine:db_query");
                const sql = (dbQuery?.attributes?.["db.query.text"] ?? dbQuery?.attributes?.["db.statement"]);
                if (!sql)
                    return;
                const store = storage.getStore();
                if (store) {
                    store.sql = sql;
                }
            },
        };
        const value = { helper };
        globalThis[`V${majorVersion}_PRISMA_INSTRUMENTATION`] = value;
        globalThis.PRISMA_INSTRUMENTATION = value;
    }
}
exports.PrismaIntegration = PrismaIntegration;
exports.default = new PrismaIntegration();
