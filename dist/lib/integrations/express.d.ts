import { RequireIntegration } from "../types/integrations";
export declare class ExpressIntegration extends RequireIntegration {
    protected readonly packageName: string;
    protected shim(expressExport: any): any;
    /**
     * Shim an individual HTTP method for express
     *
     * @param {string} method - the HTTP method (ex. "GET")
     * @param {any} expressExport - the express export
     * @returns {any} the modified express export
     */
    private shimHTTPMethod;
}
declare const _default: ExpressIntegration;
export default _default;
