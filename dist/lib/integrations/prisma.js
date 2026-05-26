"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
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
        var _a, _b, _c, _d;
        try {
            const version = (_d = (_c = (_b = (_a = prismaExport) === null || _a === void 0 ? void 0 : _a.Prisma) === null || _b === void 0 ? void 0 : _b.prismaVersion) === null || _c === void 0 ? void 0 : _c.client, (_d !== null && _d !== void 0 ? _d : ""));
            return parseInt(version.split(".")[0], 10) || 0;
        }
        catch (_e) {
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
            getTraceParent: (ctx) => {
                var _a, _b;
                return _b = (_a = storage.getStore()) === null || _a === void 0 ? void 0 : _a.traceparent, (_b !== null && _b !== void 0 ? _b : "00-10-10-00");
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
                const traceparent = `00-${crypto_1.randomBytes(16).toString("hex")}-${crypto_1.randomBytes(8).toString("hex")}-01`;
                const sqlStore = { sql: null, traceparent };
                return integration.scout.instrument(types_1.ScoutSpanOperation.SQLQuery, (done) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                    var _a, _b, _c;
                    const span = (_b = (_a = integration.scout) === null || _a === void 0 ? void 0 : _a.getCurrentSpan(), (_b !== null && _b !== void 0 ? _b : null));
                    try {
                        // Run the Prisma operation inside the AsyncLocalStorage context.
                        // dispatchEngineSpans fires within this same Promise chain and
                        // writes the SQL back into sqlStore via storage.getStore().
                        const result = yield storage.run(sqlStore, () => callback());
                        if (span) {
                            yield span.addContext(types_1.ScoutContextName.DBStatement, (_c = sqlStore.sql, (_c !== null && _c !== void 0 ? _c : "(unknown)")));
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
                }));
            },
            // Called by Prisma after the engine executes SQL. spans contains the
            // full trace tree; prisma:engine:db_query carries the raw parameterized
            // SQL. Prisma 6.19+ uses db.query.text (updated OTel semconv); older
            // Prisma 6.x used db.statement. Check both.
            dispatchEngineSpans(spans) {
                var _a, _b, _c, _d, _e;
                const dbQuery = spans.find(s => s.name === "prisma:engine:db_query");
                const sql = (_c = (_b = (_a = dbQuery) === null || _a === void 0 ? void 0 : _a.attributes) === null || _b === void 0 ? void 0 : _b["db.query.text"], (_c !== null && _c !== void 0 ? _c : (_e = (_d = dbQuery) === null || _d === void 0 ? void 0 : _d.attributes) === null || _e === void 0 ? void 0 : _e["db.statement"]));
                if (!sql) {
                    return;
                }
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
