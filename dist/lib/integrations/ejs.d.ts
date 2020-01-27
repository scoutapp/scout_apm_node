import { ExportBag, RequireIntegration } from "../types/integrations";
export declare class EJSIntegration extends RequireIntegration {
    protected readonly packageName: string;
    ritmHook(exportBag: ExportBag): void;
    private shimEJS;
    /**
     * Shim for ejs's `render` function
     *
     * @param {any} ejsExport - ejs's export
     */
    private shimEJSRender;
    /**
     * Shim for ejs's `renderFile` function
     *
     * @param {any} ejsExport - ejs's export
     */
    private shimEJSRenderFile;
}
declare const _default: EJSIntegration;
export default _default;
