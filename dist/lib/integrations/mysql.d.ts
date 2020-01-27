import { ExportBag, RequireIntegration } from "../types/integrations";
export declare class MySQLIntegration extends RequireIntegration {
    protected readonly packageName: string;
    ritmHook(exportBag: ExportBag): void;
    private shimMySQL;
    /**
     * Shim for mysql's `createConnection` function
     * since mysql handles everything from a connection instance this is where the shimming needs to happen
     *
     * @param {Connection} client - mysql's `Connection` class
     */
    private shimMySQLCreateConnection;
    /**
     * Shims the `query` function of a MySQL Connection
     *
     * @param {any} exports - the mysql exports
     * @param {Connection} conn - the mysql connection
     */
    private shimMySQLConnectionQuery;
}
declare const _default: MySQLIntegration;
export default _default;
