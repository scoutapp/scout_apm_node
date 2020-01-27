import { ExportBag, RequireIntegration } from "../types/integrations";
export declare class PGIntegration extends RequireIntegration {
    protected readonly packageName: string;
    ritmHook(exportBag: ExportBag): void;
    private shimPG;
    /**
     * Shim for pg's `connect` function
     *
     * @param {Client} client - pg's `Client` class
     */
    private shimPGConnect;
    /**
     * Shim for pg's `query` function
     *
     * @param {Client} client - pg's `Client` class
     */
    private shimPGQuery;
}
declare const _default: PGIntegration;
export default _default;
