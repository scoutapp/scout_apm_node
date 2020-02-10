import { RequireIntegration } from "../types/integrations";
export declare class HttpIntegration extends RequireIntegration {
    protected readonly packageName: string;
    protected shim(httpExport: any): any;
    /**
     * Shim for http's `request` function
     *
     * @param {any} httpExport - http's export
     */
    private shimHttpRequest;
}
declare const _default: HttpIntegration;
export default _default;
