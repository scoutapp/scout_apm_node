"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
// Hook into the express and mongodb module
class PGIntegration extends integrations_1.RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "pg";
    }
    shim(pgExport) {
        // Shim client
        pgExport = this.shimPGConnect(pgExport);
        pgExport = this.shimPGQuery(pgExport);
        // Add the integration symbol to the client class itself
        pgExport.Client[integrations_1.getIntegrationSymbol()] = this;
        return pgExport;
    }
    /**
     * Shim for pg's `connect` function
     *
     * @param {any} pgExport - pg's exports
     */
    shimPGConnect(pgExport) {
        const Client = pgExport.Client;
        const originalConnectFn = Client.prototype.connect;
        const integration = this;
        const fn = function (userCallback) {
            integration.logFn("[scout/integrations/pg] Connecting to Postgres db...", types_1.LogLevel.Trace);
            // If a callback was specified we need to do callback version
            if (userCallback) {
                return originalConnectFn.apply(this, [
                    err => {
                        if (err) {
                            integration.logFn("[scout/integrations/pg] Connection to Postgres db failed", types_1.LogLevel.Trace);
                            userCallback(err);
                            return;
                        }
                        userCallback();
                    },
                ]);
            }
            // Promise version
            return originalConnectFn.apply(this, [])
                .then(() => {
                integration.logFn("[scout/integrations/pg] Successfully connected to Postgres db", types_1.LogLevel.Trace);
            })
                .catch(err => {
                integration.logFn("[scout/integrations/pg] Connection to Postgres db failed", types_1.LogLevel.Trace);
                // Re-throw error
                throw err;
            });
        };
        Client.prototype.connect = fn;
        return pgExport;
    }
    /**
     * Shim for pg's `query` function
     *
     * @param {any} pgExport - pg's exports
     */
    shimPGQuery(pgExport) {
        const Client = pgExport.Client;
        const Query = pgExport.Query;
        const originalQueryFn = Client.prototype.query;
        const integration = this;
        // By the time this function runs we *should* have a scout instance set.
        const fn = function (config, values, userCallback) {
            integration.logFn("[scout/integrations/pg] Querying Postgres db...", types_1.LogLevel.Trace);
            // If no scout instsance or the query is undefined go straight to pg
            if (!integration.scout || !config) {
                return originalQueryFn.apply(this, [config, values, userCallback]);
            }
            // Detect what kind of query is being used
            // https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/client.js
            let query;
            if (typeof config.submit === "function") {
                query = config;
            }
            else {
                query = new Query(...arguments);
            }
            return integration.scout.instrument(types_1.ScoutSpanOperation.SQLQuery, done => {
                const span = integration.scout.getCurrentSpan();
                // If we weren't able to get the span we just started, something is wrong, do the regular call
                if (!span) {
                    integration.logFn("[scout/integrations/pg] Unable to get current span", types_1.LogLevel.Debug);
                    return originalQueryFn.apply(this, [config, values, userCallback]);
                }
                return span
                    // Update span context with the DB statement
                    .addContext({ name: types_1.ScoutContextName.DBStatement, value: query.text })
                    // Run pg's query function
                    .then(() => originalQueryFn.apply(this, [config, values, userCallback]))
                    .then(res => {
                    integration.logFn("[scout/integrations/pg] Successfully queried Postgres db", types_1.LogLevel.Trace);
                    return res;
                })
                    .catch(err => {
                    integration.logFn("[scout/integrations/pg] Query failed", types_1.LogLevel.Trace);
                    // Mark the span as errored
                    if (span) {
                        span.addContext({ name: "error", value: "true" });
                    }
                    // Rethrow the error
                    throw err;
                })
                    .finally(() => done());
            });
        };
        Client.prototype.query = fn;
        return pgExport;
    }
}
exports.PGIntegration = PGIntegration;
exports.default = new PGIntegration();
