import { RequireIntegration } from "../types/integrations";
import { ExpressFn } from "../types";
export declare class ExpressIntegration extends RequireIntegration {
    protected readonly packageName: string;
    protected shim(expressExport: any): any;
    /**
     * Shim an existing express object
     *
     * @param {Function} fn - express function (default export)
     * @returns {Function} the modified (shimmed) express function
     */
    shimExpressFn(fn: ExpressFn): ExpressFn;
    /**
     * Shim express application creation
     *
     * @param {any} expressExport
     * @return {any} the modified express export
     */
    private shimApplicationCreate;
    /**
     * Shim an individual HTTP method for express
     *
     * @param {string} method - the HTTP method (ex. "GET")
     * @param {Application} app - the express app
     * @returns {any} the modified express export
     */
    private shimHTTPMethod;
}
declare const _default: ExpressIntegration;
export default _default;
