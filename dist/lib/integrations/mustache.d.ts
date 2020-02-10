import { RequireIntegration } from "../types/integrations";
/**
 * Integration for the mustache package
 * https://www.npmjs.com/package/mustache
 *
 */
export declare class MustacheIntegration extends RequireIntegration {
    protected readonly packageName: string;
    protected shim(mustacheExport: any): any;
    /**
     * Shim for mustache's `render` function
     *
     * @param {any} mustacheExport - mustache's export
     */
    private shimMustacheClass;
}
declare const _default: MustacheIntegration;
export default _default;
