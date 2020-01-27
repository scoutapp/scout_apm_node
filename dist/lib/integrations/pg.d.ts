import { ExportBag, RequireIntegration } from "../types/integrations";
export declare class PGIntegration extends RequireIntegration {
    protected readonly packageName: string;
    ritmHook(exportBag: ExportBag): void;
    private shimPG;
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
}
declare const _default: PGIntegration;
export default _default;
