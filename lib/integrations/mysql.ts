import * as path from "path";
import { ExportBag, RequireIntegration, getIntegrationSymbol } from "../types/integrations";
import { Scout } from "../scout";
import { Connection, ConnectionConfig, QueryFunction } from "mysql";
import { LogFn, LogLevel, ScoutContextName, ScoutSpanOperation } from "../types";
import * as Constants from "../constants";

// From @types/mysql
type CreateConnectionFn = (connectionUri: string | ConnectionConfig) => Connection;

// Hook into the express and mongodb module
export class MySQLIntegration extends RequireIntegration {
    protected readonly packageName: string = "mysql";

    protected shim(mysqlExport: any): any {
        mysqlExport = this.shimMySQLCreateConnection(mysqlExport);

        return mysqlExport;
    }

    /**
     * Shim for mysql's `createConnection` function
     * since mysql handles everything from a connection instance this is where the shimming needs to happen
     *
     * @param {Connection} client - mysql's `Connection` class
     */
    private shimMySQLCreateConnection(mysqlExport: any): any {
        const original = mysqlExport.createConnection;
        const integration = this;

        const createConnection = function(this: Connection, uriOrCfg: string | ConnectionConfig) {
            const connection: Connection = original.bind(this)(uriOrCfg);
            integration.logFn("[scout/integrations/mysql] Creating connection to Mysql db...", LogLevel.Trace);

            // Add the scout integration symbol so we know the connection itself has been
            // created by our shimmed createConnection
            connection[getIntegrationSymbol()] = this;

            // Shim the connection instance itself
            return integration.shimMySQLConnectionQuery(mysqlExport, connection);
        };

        mysqlExport.createConnection = createConnection;
        return mysqlExport;
    }

    /**
     * Shims the `query` function of a MySQL Connection
     *
     * @param {any} exports - the mysql exports
     * @param {Connection} conn - the mysql connection
     */
    private shimMySQLConnectionQuery(exports: any, conn: Connection): Connection {
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
            integration.scout.instrument(ScoutSpanOperation.SQLQuery, stopSpan => {
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
                        // If there was no span we can run the callback and move on
                        if (!span) {
                            cb(err, results);
                            return;
                        }

                        // Stop the span ASAP
                        stopSpan();

                        // Add context to indicate error (we assume this will run *before* the span is sent off)
                        span!.addContextSync({name: "error", value: "true"});
                        integration.logFn("[scout/integrations/mysql] Query failed", LogLevel.Trace);

                        // Run the callback
                        cb(err, results);

                        return;
                    }

                    // Stop the span ASAP
                    stopSpan();

                    integration.logFn("[scout/integrations/mysql] Successfully queried MySQL db", LogLevel.Debug);
                    // If no errors ocurred stop the span and run the user's callback
                    ranFn = true;
                    cb(err, results);
                };

                // After making the wrapped cb, we have to replace the argument
                arguments[cbIdx] = wrappedCb;

                span
                // Add query to the context
                    .addContext({name: ScoutContextName.DBStatement, value: builtQuery.sql})
                // Do the query
                    .then(() => {
                        ranFn = true;
                        originalFn.apply(this, originalArgs as any);
                    })
                // If an error occurred adding the scout context
                    .catch(err => {
                        integration.logFn("[scout/integrations/mysql] Internal failure", LogLevel.Trace);
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

export default new MySQLIntegration();
