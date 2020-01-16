import * as path from "path";
import * as Hook from "require-in-the-middle";
import { ExportBag, RequireIntegration, scoutIntegrationSymbol } from "../types/integrations";
import { Scout } from "../scout";
import { Client, Query } from "pg";
import { LogFn, LogLevel, ScoutContextNames } from "../types";
import * as Constants from "../constants";

// Hook into the express and mongodb module
export class PGIntegration implements RequireIntegration {
    private readonly packageName: string = "pg";
    private scout: Scout;
    private logFn: LogFn = () => undefined;

    public getPackageName() {
        return this.packageName;
    }

    public ritmHook(exportBag: ExportBag): void {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // If the shim has already been run, then finish
            if (!exports || scoutIntegrationSymbol in exports) {
                return exports;
            }

            // Make changes to the pg package to enable integration
            this.shimPG(exports);

            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;

            // Add the scoutIntegrationSymbol to show that the shim has run
            exports.Client[scoutIntegrationSymbol] = this;

            // Return the modified exports
            return exports;
        });
    }

    public setScoutInstance(scout: Scout) {
        this.scout = scout;
    }

    public setLogFn(logFn: LogFn) {
        this.logFn = logFn;
    }

    private shimPG(pgExport: any) {
        // Check if the shim has already been performed
        const client = pgExport.Client;
        if (client[scoutIntegrationSymbol]) { return; }

        // Shim client
        this.shimPGConnect(client);
        this.shimPGQuery(client);
    }

    /**
     * Shim for pg's `connect` function
     *
     * @param {Client} client - pg's `Client` class
     */
    private shimPGConnect(client: Client) {
        const original = Client.prototype.connect;
        const integration = this;

        const fn: any = function(this: typeof Client, userCallback?: (err?: Error) => void) {
            integration.logFn("[scout/integrations/pg] Connecting to Postgres db...", LogLevel.Debug);

            // If a callback was specified we need to do callback version
            if (userCallback) {
                return original.bind(this)(err => {
                    if (err) {
                        integration.logFn("[scout/integrations/pg] Connection to Postgres db failed", LogLevel.Debug);
                        userCallback(err);
                        return;
                    }
                    userCallback();
                });

            }

            // Promise version
            return original.bind(this)()
                .then(() => {
                    integration.logFn("[scout/integrations/pg] Successfully connected to Postgres db", LogLevel.Debug);
                })
                .catch(err => {
                    integration.logFn("[scout/integrations/pg] Connection to Postgres db failed", LogLevel.Debug);
                    // Re-throw error
                    throw err;
                 });
        };

        Client.prototype.connect = fn;
    }

    /**
     * Shim for pg's `query` function
     *
     * @param {Client} client - pg's `Client` class
     */
    private shimPGQuery(client: Client) {
        const original = Client.prototype.query;
        const integration = this;

        // By the time this function runs we *should* have a scout instance set.
        const fn: any = function(this: typeof Client, config, values, userCallback) {
            integration.logFn("[scout/integrations/pg] Querying Postgres db...", LogLevel.Debug);

            // If no scout instsance or the query is undefined go straight to pg
            if (!integration.scout || !config) {
                return original.bind(this)(config, values, userCallback);
            }

            // Detect what kind of query is being used
            // https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/client.js
            let query: Query;
            if (typeof config.submit === "function") {
                query = config;
            } else {
                query = new Query(...arguments);
            }

            return integration.scout.instrument(Constants.SCOUT_SQL_QUERY, done => {
                const span = integration.scout.getCurrentSpan();
                // If we weren't able to get the span we just started, something is wrong, do the regular call
                if (!span) {
                    integration.logFn("[scout/integrations/pg] Unable to get current span", LogLevel.Warn);
                    return original.bind(this)(config, values, userCallback);
                }

                return span
                // Update span context with the DB statement
                    .addContext([{name: ScoutContextNames.DBStatement, value: (query as any).text}])
                // Run pg's query function
                    .then(() => original.bind(this)(config, values, userCallback))
                    .then(res => {
                        integration.logFn("[scout/integrations/pg] Successfully queried Postgres db", LogLevel.Debug);
                        return res;
                    })
                    .catch(err => {
                        integration.logFn("[scout/integrations/pg] Query failed", LogLevel.Debug);

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
