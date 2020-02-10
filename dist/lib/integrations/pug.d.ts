import { RequireIntegration } from "../types/integrations";
export declare class PugIntegration extends RequireIntegration {
    protected readonly packageName: string;
    protected shim(pugExport: any): any;
    /**
     * Shim for pug's `render` function
     *
     * @param {any} pugExport - pug's export
     */
    private shimPugRender;
    /**
     * Shim for pug's `renderFile` function
     *
     * @param {any} pugExport - pug's export
     */
    private shimPugRenderFile;
}
declare const _default: PugIntegration;
export default _default;
