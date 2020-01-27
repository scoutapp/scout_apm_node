import { ExportBag, RequireIntegration } from "../types/integrations";
export declare class HttpIntegration extends RequireIntegration {
    protected readonly packageName: string;
    ritmHook(exportBag: ExportBag): void;
    private shimHttp;
    /**
     * Shim for http's `request` function
     *
     * @param {any} httpExport - http's export
     */
    private shimHttpRequest;
}
declare const _default: HttpIntegration;
export default _default;
