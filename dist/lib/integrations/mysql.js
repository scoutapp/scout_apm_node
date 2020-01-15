"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Hook = require("require-in-the-middle");
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
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
            // Make changes to the mysql package to enable integration
            this.shimMySQL(exports);
            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;
            // Add the scoutIntegrationSymbol to show that the shim has run
            exports.Connection[integrations_1.scoutIntegrationSymbol] = this;
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
        const c = mysqlExport.createConnection("localhost");
        if (c[integrations_1.scoutIntegrationSymbol]) {
            return;
        }
        this.shimMySQLCreateConnection(mysqlExport.createConnection);
    }
    /**
     * Shim for mysql's `createConnection` function
     * since mysql handles everything from a connection instance this is where the shimming needs to happen
     *
     * @param {Connection} client - mysql's `Connection` class
     */
    shimMySQLCreateConnection(createConnectionFn) {
        const original = createConnectionFn;
        const integration = this;
        const modified = function (uriOrCfg) {
            const connection = original.bind(this)(uriOrCfg);
            integration.logFn("[scout/integrations/mysql] Creating connection to Mysql db...", types_1.LogLevel.Debug);
            // Shim the connection instance itself
            return integration.shimMySQLConnection(connection);
        };
        createConnectionFn = modified;
    }
    /**
     * Shims a MySQL Connection object
     *
     */
    shimMySQLConnection(conn) {
        // Add the scout integration symbol
        conn[integrations_1.scoutIntegrationSymbol] = this;
        return conn;
    }
}
exports.MySQLIntegration = MySQLIntegration;
exports.default = new MySQLIntegration();
