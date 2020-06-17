import { RequireIntegration } from "../types/integrations";
export declare class HTTPIntegration extends RequireIntegration {
    protected readonly packageName: string;
    protected shim(httpExport: any): any;
    /**
     * Shim for http's `request` function
     *
     * @param {any} httpExport - http's export
     */
    protected shimHTTPRequest(httpExport: any): any;
}
declare const _default: HTTPIntegration;
export default _default;
