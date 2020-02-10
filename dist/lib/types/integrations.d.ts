import { Scout } from "../scout";
import { LogFn } from "./util";
export declare const scoutIntegrationSymbol: unique symbol;
export interface ExportBag {
    [key: string]: any;
}
export declare abstract class RequireIntegration {
    protected readonly packageName: string;
    protected scout: Scout;
    protected logFn: LogFn;
    /**
     * Retrieve the name of the require integration
     *
     * @returns {string} the name of this integration
     */
    getPackageName(): string;
    /**
     * Perform the require-in-the-middle Hook() that will set up the integration.
     *
     * @param {ExportBag} exportBag - The bag of exports that have been shimmed by scout already
     */
    ritmHook(exportBag: ExportBag): void;
    /**
     * Shim the exports of the given require()'d library
     *
     * @param {any} moduleExport - the export of the library
     * @returns {any} the shimmed export
     */
    protected abstract shim(moduleExport: any): any;
    /**
     * Set the logging function for the require integration
     *
     * @param {LogFn} logFn
     */
    setLogFn(logFn: LogFn): void;
    /**
     * Set the scout instance for the integration
     *
     * @param {Scout} scout
     */
    setScoutInstance(scout: Scout): void;
}
declare class NullIntegration extends RequireIntegration {
    protected readonly packageName: string;
    protected shim(someExport: any): void;
    setScoutInstance(): void;
}
export declare const doNothingRequireIntegration: NullIntegration;
export {};
