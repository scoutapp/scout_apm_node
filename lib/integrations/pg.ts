import * as path from "path";
import { ExportBag, RequireIntegration } from "../types/integrations";
import { Scout } from "../scout";
import { LogFn, LogLevel, ScoutContextName, ScoutSpanOperation } from "../types";
import * as Constants from "../constants";

// We can't import pg and use the Client class, and can't import *only* the types.
// https://github.com/Microsoft/TypeScript/issues/16472
type Client = any;
type Query = any;

// Hook into the express and mongodb module
export class PGIntegration extends RequireIntegration {
    protected readonly packageName: string = "pg";

    protected shim(pgExport: any) {
        // Shim client
        this.shimPGConnect(pgExport);
        this.shimPGQuery(pgExport);

        return pgExport;
    }

    /**
     * Shim for pg's `connect` function
     *
     * @param {any} pgExport - pg's exports
     */
    private shimPGConnect(pgExport: any) {
        const Client: Client = pgExport.Client;

        const originalConnectFn = Client.prototype.connect;
        const integration = this;

        const fn: any = function(this: Client, userCallback?: (err?: Error) => void) {
            integration.logFn("[scout/integrations/pg] Connecting to Postgres db...", LogLevel.Trace);

            // If a callback was specified we need to do callback version
            if (userCallback) {
                return originalConnectFn.apply(this, [
                    err => {
                        if (err) {
                            integration.logFn(
                                "[scout/integrations/pg] Connection to Postgres db failed",
                                LogLevel.Trace,
                            );
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
                    integration.logFn("[scout/integrations/pg] Successfully connected to Postgres db", LogLevel.Trace);
                })
                .catch(err => {
                    integration.logFn("[scout/integrations/pg] Connection to Postgres db failed", LogLevel.Trace);
                    // Re-throw error
                    throw err;
                 });
        };

        Client.prototype.connect = fn;
    }

    /**
     * Shim for pg's `query` function
     *
     * @param {any} pgExport - pg's exports
     */
    private shimPGQuery(pgExport: any) {
        const Client: Client = pgExport.Client;
        const Query: Query = pgExport.Query;

        const originalQueryFn = Client.prototype.query;
        const integration = this;

        // By the time this function runs we *should* have a scout instance set.
        const fn: any = function(this: Client, config, values, userCallback) {
            integration.logFn("[scout/integrations/pg] Querying Postgres db...", LogLevel.Trace);

            // If no scout instsance or the query is undefined go straight to pg
            if (!integration.scout || !config) {
                return originalQueryFn.apply(this, [config, values, userCallback]);
            }

            // Detect what kind of query is being used
            // https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/client.js
            let query: Query;
            if (typeof config.submit === "function") {
                query = config;
            } else {
                query = new Query(...arguments);
            }

            return integration.scout.instrument(ScoutSpanOperation.SQLQuery, done => {
                const span = integration.scout.getCurrentSpan();
                // If we weren't able to get the span we just started, something is wrong, do the regular call
                if (!span) {
                    integration.logFn("[scout/integrations/pg] Unable to get current span", LogLevel.Debug);
                    return originalQueryFn.apply(this, [config, values, userCallback]);
                }

                return span
                // Update span context with the DB statement
                    .addContext([{name: ScoutContextName.DBStatement, value: (query as any).text}])
                // Run pg's query function
                    .then(() => originalQueryFn.apply(this, [config, values, userCallback]))
                    .then(res => {
                        integration.logFn("[scout/integrations/pg] Successfully queried Postgres db", LogLevel.Trace);
                        return res;
                    })
                    .catch(err => {
                        integration.logFn("[scout/integrations/pg] Query failed", LogLevel.Trace);

                        // Mark the span as errored
                        if (span) { span.addContext([{name: "error", value: "true"}]); }

                        // Rethrow the error
                        throw err;
                    })
                    .finally(() => done());
            });
        };

        Client.prototype.query = fn;
    }
}

export default new PGIntegration();
