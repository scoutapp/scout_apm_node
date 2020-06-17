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
    /**
     * Shim for http's `get` function
     * `get` has to be shimmed because it uses the defined version of `request`
     * which is exported, but cannot be reassigned externally
     *
     * @param {any} httpExport - http's export
     */
    private shimHTTPGet;
}
declare const _default: HTTPIntegration;
export default _default;
