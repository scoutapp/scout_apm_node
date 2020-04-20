import * as path from "path";
import { ExportBag, RequireIntegration, getIntegrationSymbol } from "../types/integrations";
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
        pgExport = this.shimPGConnect(pgExport);
        pgExport = this.shimPGQuery(pgExport);

        // Add the integration symbol to the client class itself
        pgExport.Client[getIntegrationSymbol()] = this;

        return pgExport;
    }

    /**
     * Shim for pg's `connect` function
     *
     * @param {any} pgExport - pg's exports
     */
    private shimPGConnect(pgExport: any): any {
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

        return pgExport;
    }

    /**
     * Shim for pg's `query` function
     *
     * @param {any} pgExport - pg's exports
     */
    private shimPGQuery(pgExport: any): any {
        const Client: Client = pgExport.Client;
        const Query: Query = pgExport.Query;

        const originalQueryFn = Client.prototype.query;
        const integration = this;

        // By the time this function runs we *should* have a scout instance set.
        const fn: any = function(this: Client, config, values, userCallback) {
            const originalArgs = arguments;
            integration.logFn("[scout/integrations/pg] Querying Postgres db...", LogLevel.Trace);

            // If no scout instsance or the query is undefined go straight to pg
            if (!integration.scout || !config) {
                return originalQueryFn.apply(this, originalArgs);
            }

            // Detect what kind of query is being used
            // https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/client.js
            const query: Query = typeof config.submit === "function" ? config : new Query(...originalArgs);

            return integration.scout.instrument(ScoutSpanOperation.SQLQuery, done => {
                const span = integration.scout.getCurrentSpan();
                // If we weren't able to get the span we just started, something is wrong, do the regular call
                if (!span) {
                    integration.logFn("[scout/integrations/pg] Unable to get current span", LogLevel.Debug);
                    return originalQueryFn.apply(this, [config, values, userCallback])
                        .then(() => done());
                }

                let queryResult: any;

                return span
                // Update span context with the DB statement
                    .addContext(ScoutContextName.DBStatement, (query as any).text)
                // Run pg's query function, saving the result
                    .then(() => originalQueryFn.apply(this, originalArgs))
                    .then(r => queryResult = r)
                // Finish the instrumentation
                    .then(() => done())
                    .then(() => integration.logFn(
                        "[scout/integrations/pg] Successfully queried Postgres db",
                        LogLevel.Trace,
                    ))
                    .then(() => queryResult)
                    .catch(err => {
                        // Finish the instrumentation ASAP
                        done();

                        // Mark the span as errored, we assume that the span won't be sent before this line can run
                        // otherwise the context would miss it's window to be sent
                        if (span) { span.addContext(ScoutContextName.Error, "true"); }

                        integration.logFn("[scout/integrations/pg] Query failed", LogLevel.Trace);

                        // Rethrow the error
                        throw err;
                    });
            });
        };

        Client.prototype.query = fn;

        return pgExport;
    }
}

export default new PGIntegration();
