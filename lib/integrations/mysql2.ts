import * as path from "path";
import * as Hook from "require-in-the-middle";
import { ExportBag, RequireIntegration, scoutIntegrationSymbol } from "../types/integrations";
import { Scout } from "../scout";
import { Connection, ConnectionConfig, QueryFunction } from "mysql";
import { LogFn, LogLevel, ScoutContextNames } from "../types";
import * as Constants from "../constants";

// From @types/mysql
type CreateConnectionFn = (connectionUri: string | ConnectionConfig) => Connection;

// Hook into the express and mongodb module
export class MySQL2Integration implements RequireIntegration {
    private readonly packageName: string = "mysql2";
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

            // Make changes to the mysql2 package to enable integration
            exports = this.shimMySQL2(exports);

            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;

            // Add the scoutIntegrationSymbol to the mysql export itself to show the shim was run
            exports[scoutIntegrationSymbol] = this;

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

    private shimMySQL2(mysql2Export: any): any {
        // Check if the shim has already been performed
        if (scoutIntegrationSymbol in mysql2Export) { return; }

        return this.shimMySQL2CreateConnection(mysql2Export);
    }

    /**
     * Shim for mysql's `createConnection` function
     * since mysql handles everything from a connection instance this is where the shimming needs to happen
     *
     * @param {Connection} client - mysql's `Connection` class
     */
    private shimMySQL2CreateConnection(mysql2Export: any): any {
        // We need to shim the constructor of the connection class itself
        const originalCtor = mysql2Export.Connection;
        const integration = this;

        const modifiedCtor = function(this: Connection, uriOrCfg: string | ConnectionConfig) {
            const conn = new originalCtor(uriOrCfg);

            integration.logFn("[scout/integrations/mysql2] Creating connection to Mysql db...", LogLevel.Debug);

            // Add the scout integration symbol so we know the connection itself has been
            // created by our shimmed createConnection
            conn[scoutIntegrationSymbol] = integration;

            // Shim the connection instance itself
            integration.shimMySQL2ConnectionQuery(mysql2Export, conn);

            return conn;
        };

        mysql2Export.Connection = modifiedCtor;
        return mysql2Export;
    }

    /**
     * Shims the `query` function of a MySQL2 Connection
     *
     * @param {any} exports - the mysql2 exports
     * @param {Connection} conn - the mysql2 connection
     */
    private shimMySQL2ConnectionQuery(exports: any, conn: Connection): Connection {
        const originalFn = conn.query;
        const integration = this;

        const modified: any = function(this: Connection) {
            const originalArgs = arguments;

            // If no scout instance is available then run the function normally
            if (!integration.scout) { return originalFn.apply(this, originalArgs as any); }

            // We need to find which one of the arguments was the callback if there was one)
            const originalArgsArr = Array.from(originalArgs);
            const cbIdx = originalArgsArr.findIndex(a => typeof a === "function");
            // If a callback wasn't provided use a function that does nothing
            const cb = cbIdx >= 0 ? originalArgsArr[cbIdx] : () => undefined;

            // We have to assume that the first argument is the SQL string (or object)
            const sql = originalArgsArr[0];

            // Build a version of the query to take advantage of the string/object parsing of mysql
            const builtQuery = exports.createQuery(sql);
            let ranFn = false;

            // Start the instrumentation
            integration.scout.instrument(Constants.SCOUT_SQL_QUERY, stopSpan => {
                // Get span, exit early if there was an issue getting the current span
                const span = integration.scout.getCurrentSpan();
                if (!span) {
                    ranFn = true;
                    originalFn.apply(this, originalArgs as any);
                    return;
                }

                // Create a callback that will intercept the results
                const wrappedCb = (err, results) => {
                    // If an error occurred mark the span as errored and then stop it
                    if (err) {
                        integration.logFn("[scout/integrations/mysql2] Query failed", LogLevel.Debug);
                        if (!span) {
                            cb(err, results);
                            return;
                        }

                        span!
                            .addContext([{name: "error", value: "true"}])
                            .then(() => stopSpan())
                            .finally(() => cb(err, results));

                        return;
                    }

                    integration.logFn("[scout/integrations/mysql2] Successfully queried MySQL db", LogLevel.Debug);
                    // If no errors ocurred stop the span and run the user's callback
                    stopSpan();
                    ranFn = true;
                    cb(err, results);
                };

                // After making the wrapped cb, we have to replace the argument
                arguments[cbIdx] = wrappedCb;

                span
                // Add query to the context
                    .addContext([{name: ScoutContextNames.DBStatement, value: builtQuery.sql}])
                // Do the query
                    .then(() => {
                        ranFn = true;
                        originalFn.apply(this, originalArgs as any);
                    })
                // If an error occurred adding the scout context
                    .catch(err => {
                        integration.logFn("[scout/integrations/mysql2] Internal failure", LogLevel.Error);
                        // If the original function has not been run yet we need to run it at least
                        if (!ranFn) {
                            // Run the function with the original requests
                            originalFn.apply(this, originalArgs as any);
                            ranFn = true;
                        }
                    });
            });
        };

        conn.query = modified;
        return conn;
    }
}

export default new MySQL2Integration();
