import { RequireIntegration } from "../types/integrations";
export declare class PGIntegration extends RequireIntegration {
    protected readonly packageName: string;
    protected shim(pgExport: any): any;
    /**
     * Shim for pg's `connect` function
     *
     * @param {any} pgExport - pg's exports
     */
    private shimPGConnect;
    /**
     * Shim for pg's `query` function
     *
     * @param {any} pgExport - pg's exports
     */
    private shimPGQuery;
    /**
     * Shim for pg's `Conenction` class
     *
     * @param {any} pgExport - pg's exports
     */
    private shimPGConnection;
}
declare const _default: PGIntegration;
export default _default;
