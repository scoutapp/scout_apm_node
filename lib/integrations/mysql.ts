import * as path from "path";
import * as Hook from "require-in-the-middle";
import { ExportBag, RequireIntegration, scoutIntegrationSymbol } from "../types/integrations";
import { Scout } from "../scout";
import { Connection, ConnectionConfig, QueryFunction } from "mysql";
import { LogFn, LogLevel } from "../types";

// From @types/mysql
type CreateConnectionFn = (connectionUri: string | ConnectionConfig) => Connection;

// Hook into the express and mongodb module
export class MySQLIntegration implements RequireIntegration {
    private readonly packageName: string = "mysql";
    private scout: Scout;
    private logFn: LogFn = () => undefined;

    public getPackageName() {
        return this.packageName;
    }

    public ritmHook(exportBag: ExportBag): void {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // Make changes to the mysql package to enable integration
            this.shimMySQL(exports);

            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;

            // Add the scoutIntegrationSymbol to show that the shim has run
            exports.Connection[scoutIntegrationSymbol] = this;

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

    private shimMySQL(mysqlExport: any) {
        // Check if the shim has already been performed
        const c = mysqlExport.createConnection("localhost");
        if (c[scoutIntegrationSymbol]) { return; }

        this.shimMySQLCreateConnection(mysqlExport.createConnection);
    }

    /**
     * Shim for mysql's `createConnection` function
     * since mysql handles everything from a connection instance this is where the shimming needs to happen
     *
     * @param {Connection} client - mysql's `Connection` class
     */
    private shimMySQLCreateConnection(createConnectionFn: CreateConnectionFn) {
        const original = createConnectionFn;
        const integration = this;

        const modified = function(this: Connection, uriOrCfg: string | ConnectionConfig) {
            const connection: Connection = original.bind(this)(uriOrCfg);
            integration.logFn("[scout/integrations/mysql] Creating connection to Mysql db...", LogLevel.Debug);

            // Shim the connection instance itself
            return integration.shimMySQLConnection(connection);
        };

        createConnectionFn = modified;
    }

    /**
     * Shims a MySQL Connection object
     *
     */
    private shimMySQLConnection(conn: Connection): Connection {
        // Add the scout integration symbol
        conn[scoutIntegrationSymbol] = this;

        return conn;
    }
}

export default new MySQLIntegration();
