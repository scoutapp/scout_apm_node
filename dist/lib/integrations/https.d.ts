import { HTTPIntegration } from "./http";
export declare class HTTPSIntegration extends HTTPIntegration {
    protected readonly packageName: string;
    protected shim(httpsExport: any): any;
    /**
     * Shim for https's `get` function
     * `get` has to be shimmed because it uses the defined version of `request`
     * which is exported, but cannot be reassigned externally
     *
     * @param {any} httpsExport - https's export
     */
    private shimHTTPSGet;
}
declare const _default: HTTPSIntegration;
export default _default;
