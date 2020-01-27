import { ExportBag, RequireIntegration } from "../types/integrations";
export declare class MySQL2Integration extends RequireIntegration {
    protected readonly packageName: string;
    ritmHook(exportBag: ExportBag): void;
    private shimMySQL2;
    /**
     * Shim for mysql's `createConnection` function
     * since mysql handles everything from a connection instance this is where the shimming needs to happen
     *
     * @param {any} mysql2 - mysql2's main export
     */
    private shimMySQL2CreateConnection;
    /**
     * Shims the `query` function of a MySQL2 Connection
     *
     * @param {any} exports - the mysql2 exports
     * @param {Connection} conn - the mysql2 connection
     */
    private shimMySQL2ConnectionQuery;
}
declare const _default: MySQL2Integration;
export default _default;
