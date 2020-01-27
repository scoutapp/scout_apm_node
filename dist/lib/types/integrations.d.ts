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
     * Set the logging function for the require integration
     *
     * @param {LogFn} logFn
     */
    setLogFn(logFn: LogFn): void;
    /**
     * Perform the require-in-the-middle Hook() that will set up the integration.
     *
     * @param {any} exportBag - The bag of exports that have been shimmed by scout already
     */
    abstract ritmHook(exportBag: ExportBag): any;
    /**
     * Set the scout instance for the integration
     *
     * @param {Scout} scout
     */
    setScoutInstance(scout: Scout): void;
}
declare class NullIntegration extends RequireIntegration {
    protected readonly packageName: string;
    ritmHook(exportBag: ExportBag): void;
    setScoutInstance(): void;
}
export declare const doNothingRequireIntegration: NullIntegration;
export {};
