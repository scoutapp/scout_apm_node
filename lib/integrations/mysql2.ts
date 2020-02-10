import * as path from "path";
import { ExportBag, RequireIntegration, getIntegrationSymbol } from "../types/integrations";
import { Scout } from "../scout";
import { Connection, ConnectionConfig, QueryFunction } from "mysql";
import { LogFn, LogLevel, ScoutContextName, ScoutSpanOperation } from "../types";
import * as Constants from "../constants";

// From @types/mysql
type CreateConnectionFn = (connectionUri: string | ConnectionConfig) => Connection;

// Hook into the express and mongodb module
export class MySQL2Integration extends RequireIntegration {
    protected readonly packageName: string = "mysql2";

    protected shim(mysql2Export: any): any {
        mysql2Export = this.shimMySQL2CreateConnection(mysql2Export);

        return mysql2Export;
    }

    /**
     * Shim for mysql's `createConnection` function
     * since mysql handles everything from a connection instance this is where the shimming needs to happen
     *
     * @param {any} mysql2 - mysql2's main export
     */
    private shimMySQL2CreateConnection(mysql2Export: any): any {
        // We need to shim the constructor of the connection class itself
        const originalCtor = mysql2Export.Connection;
        const integration = this;

        const modifiedCtor = function(this: Connection, uriOrCfg: string | ConnectionConfig) {
            const conn = new originalCtor(uriOrCfg);

            integration.logFn("[scout/integrations/mysql2] Creating connection to Mysql db...", LogLevel.Trace);

            // Add the scout integration symbol so we know the connection itself has been
            // created by our shimmed createConnection
            conn[getIntegrationSymbol()] = integration;

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

        const modified: any = function(this: Connection, sql, values, cb) {
            const originalArgs = arguments;

            // If no scout instance is available then run the function normally
            if (!integration.scout) { return originalFn.bind(this)(sql, values, cb); }

            // Build a version of the query to take advantage of the string/object parsing of mysql
            const builtQuery = exports.createQuery(sql, values, cb, this.config);
            let ranFn = false;

            // Start the instrumentation
            integration.scout.instrument(ScoutSpanOperation.SQLQuery, stopSpan => {
                // Get span, exit early if there was an issue getting the current span
                const span = integration.scout.getCurrentSpan();
                if (!span) {
                    ranFn = true;
                    originalFn.bind(this)(sql, values, cb);
                    return;
                }

                // Create a callback that will intercept the results
                const wrappedCb = (err, results) => {
                    // If an error occurred mark the span as errored and then stop it
                    if (err) {
                        integration.logFn("[scout/integrations/mysql2] Query failed", LogLevel.Trace);
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

                    integration.logFn("[scout/integrations/mysql2] Successfully queried MySQL db", LogLevel.Trace);
                    // If no errors ocurred stop the span and run the user's callback
                    stopSpan();
                    ranFn = true;
                    cb(err, results);
                };

                span
                // Add query to the context
                    .addContext([{name: ScoutContextName.DBStatement, value: builtQuery.sql}])
                // Do the query
                    .then(() => {
                        ranFn = true;
                        originalFn.bind(this)(sql, values, cb);
                    })
                // If an error occurred adding the scout context
                    .catch(err => {
                        integration.logFn("[scout/integrations/mysql2] Internal failure", LogLevel.Trace);
                        // If the original function has not been run yet we need to run it at least
                        if (!ranFn) {
                            // Run the function with the original requests
                            originalFn.bind(this)(sql, values, cb);
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
