"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Hook = require("require-in-the-middle");
const integrations_1 = require("../types/integrations");
const pg_1 = require("pg");
const types_1 = require("../types");
// Hook into the express and mongodb module
class PGIntegration extends integrations_1.RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "pg";
    }
    ritmHook(exportBag) {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // If the shim has already been run, then finish
            if (!exports || integrations_1.scoutIntegrationSymbol in exports) {
                return exports;
            }
            // Make changes to the pg package to enable integration
            this.shimPG(exports);
            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;
            // Add the scoutIntegrationSymbol to show that the shim has run
            exports.Client[integrations_1.scoutIntegrationSymbol] = this;
            // Return the modified exports
            return exports;
        });
    }
    shimPG(pgExport) {
        // Check if the shim has already been performed
        const client = pgExport.Client;
        if (client[integrations_1.scoutIntegrationSymbol]) {
            return;
        }
        // Shim client
        this.shimPGConnect(client);
        this.shimPGQuery(client);
    }
    /**
     * Shim for pg's `connect` function
     *
     * @param {Client} client - pg's `Client` class
     */
    shimPGConnect(client) {
        const original = pg_1.Client.prototype.connect;
        const integration = this;
        const fn = function (userCallback) {
            integration.logFn("[scout/integrations/pg] Connecting to Postgres db...", types_1.LogLevel.Debug);
            // If a callback was specified we need to do callback version
            if (userCallback) {
                return original.bind(this)(err => {
                    if (err) {
                        integration.logFn("[scout/integrations/pg] Connection to Postgres db failed", types_1.LogLevel.Error);
                        userCallback(err);
                        return;
                    }
                    userCallback();
                });
            }
            // Promise version
            return original.bind(this)()
                .then(() => {
                integration.logFn("[scout/integrations/pg] Successfully connected to Postgres db", types_1.LogLevel.Debug);
            })
                .catch(err => {
                integration.logFn("[scout/integrations/pg] Connection to Postgres db failed", types_1.LogLevel.Error);
                // Re-throw error
                throw err;
            });
        };
        pg_1.Client.prototype.connect = fn;
    }
    /**
     * Shim for pg's `query` function
     *
     * @param {Client} client - pg's `Client` class
     */
    shimPGQuery(client) {
        const original = pg_1.Client.prototype.query;
        const integration = this;
        // By the time this function runs we *should* have a scout instance set.
        const fn = function (config, values, userCallback) {
            integration.logFn("[scout/integrations/pg] Querying Postgres db...", types_1.LogLevel.Debug);
            // If no scout instsance or the query is undefined go straight to pg
            if (!integration.scout || !config) {
                return original.bind(this)(config, values, userCallback);
            }
            // Detect what kind of query is being used
            // https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/client.js
            let query;
            if (typeof config.submit === "function") {
                query = config;
            }
            else {
                query = new pg_1.Query(...arguments);
            }
            return integration.scout.instrument(types_1.ScoutSpanOperation.SQLQuery, done => {
                const span = integration.scout.getCurrentSpan();
                // If we weren't able to get the span we just started, something is wrong, do the regular call
                if (!span) {
                    integration.logFn("[scout/integrations/pg] Unable to get current span", types_1.LogLevel.Warn);
                    return original.bind(this)(config, values, userCallback);
                }
                return span
                    // Update span context with the DB statement
                    .addContext([{ name: types_1.ScoutContextNames.DBStatement, value: query.text }])
                    // Run pg's query function
                    .then(() => original.bind(this)(config, values, userCallback))
                    .then(res => {
                    integration.logFn("[scout/integrations/pg] Successfully queried Postgres db", types_1.LogLevel.Debug);
                    return res;
                })
                    .catch(err => {
                    integration.logFn("[scout/integrations/pg] Query failed", types_1.LogLevel.Error);
                    // Mark the span as errored
                    if (span) {
                        span.addContext([{ name: "error", value: "true" }]);
                    }
                    // Rethrow the error
                    throw err;
                })
                    .finally(() => done());
            });
        };
        pg_1.Client.prototype.query = fn;
    }
}
exports.PGIntegration = PGIntegration;
exports.default = new PGIntegration();
