"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Hook = require("require-in-the-middle");
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
const Constants = require("../constants");
// Hook into the express and mongodb module
class MySQLIntegration {
    constructor() {
        this.packageName = "mysql";
        this.logFn = () => undefined;
    }
    getPackageName() {
        return this.packageName;
    }
    ritmHook(exportBag) {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // If the shim has already been run, then finish
            if (!exports || integrations_1.scoutIntegrationSymbol in exports) {
                return exports;
            }
            // Make changes to the mysql package to enable integration
            exports = this.shimMySQL(exports);
            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;
            // Add the scoutIntegrationSymbol to the mysql export itself to show the shim was run
            exports[integrations_1.scoutIntegrationSymbol] = this;
            // Return the modified exports
            return exports;
        });
    }
    setScoutInstance(scout) {
        this.scout = scout;
    }
    setLogFn(logFn) {
        this.logFn = logFn;
    }
    shimMySQL(mysqlExport) {
        // Check if the shim has already been performed
        if (integrations_1.scoutIntegrationSymbol in mysqlExport) {
            return;
        }
        return this.shimMySQLCreateConnection(mysqlExport);
    }
    /**
     * Shim for mysql's `createConnection` function
     * since mysql handles everything from a connection instance this is where the shimming needs to happen
     *
     * @param {Connection} client - mysql's `Connection` class
     */
    shimMySQLCreateConnection(mysqlExport) {
        const original = mysqlExport.createConnection;
        const integration = this;
        const createConnection = function (uriOrCfg) {
            const connection = original.bind(this)(uriOrCfg);
            integration.logFn("[scout/integrations/mysql] Creating connection to Mysql db...", types_1.LogLevel.Debug);
            // Add the scout integration symbol so we know the connection itself has been
            // created by our shimmed createConnection
            connection[integrations_1.scoutIntegrationSymbol] = this;
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
    shimMySQLConnectionQuery(exports, conn) {
        const originalFn = conn.query;
        const integration = this;
        const modified = function () {
            const originalArgs = arguments;
            // If no scout instance is available then run the function normally
            if (!integration.scout) {
                return originalFn.apply(this, originalArgs);
            }
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
                    originalFn.apply(this, originalArgs);
                    return;
                }
                // Create a callback that will intercept the results
                const wrappedCb = (err, results) => {
                    // If an error occurred mark the span as errored and then stop it
                    if (err) {
                        integration.logFn("[scout/integrations/mysql] Query failed", types_1.LogLevel.Debug);
                        if (!span) {
                            cb(err, results);
                            return;
                        }
                        span
                            .addContext([{ name: "error", value: "true" }])
                            .then(() => stopSpan())
                            .finally(() => cb(err, results));
                        return;
                    }
                    integration.logFn("[scout/integrations/mysql] Successfully queried MySQL db", types_1.LogLevel.Debug);
                    // If no errors ocurred stop the span and run the user's callback
                    stopSpan();
                    ranFn = true;
                    cb(err, results);
                };
                // After making the wrapped cb, we have to replace the argument
                arguments[cbIdx] = wrappedCb;
                span
                    // Add query to the context
                    .addContext([{ name: types_1.ScoutContextNames.DBStatement, value: builtQuery.sql }])
                    // Do the query
                    .then(() => {
                    ranFn = true;
                    originalFn.apply(this, originalArgs);
                })
                    // If an error occurred adding the scout context
                    .catch(err => {
                    integration.logFn("[scout/integrations/mysql] Internal failure", types_1.LogLevel.Error);
                    // If the original function has not been run yet we need to run it at least
                    if (!ranFn) {
                        // Run the function with the original requests
                        originalFn.apply(this, originalArgs);
                        ranFn = true;
                    }
                });
            });
        };
        conn.query = modified;
        return conn;
    }
}
exports.MySQLIntegration = MySQLIntegration;
exports.default = new MySQLIntegration();
