import { Scout } from "../scout";
import { LogFn } from "./util";
import * as Errors from "../errors";

export const scoutIntegrationSymbol = Symbol("scout");

export interface ExportBag {
    [key: string]: any;
}

export abstract class RequireIntegration {
    protected readonly packageName: string;
    protected scout: Scout;
    protected logFn: LogFn = () => undefined;

    /**
     * Retrieve the name of the require integration
     *
     * @returns {string} the name of this integration
     */
    public getPackageName(): string {
        return this.packageName;
    }

    /**
     * Set the logging function for the require integration
     *
     * @param {LogFn} logFn
     */
    public setLogFn(logFn: LogFn) {
        this.logFn = logFn;
    }

    /**
     * Perform the require-in-the-middle Hook() that will set up the integration.
     *
     * @param {any} exportBag - The bag of exports that have been shimmed by scout already
     */
    public abstract ritmHook(exportBag: ExportBag);

    /**
     * Set the scout instance for the integration
     *
     * @param {Scout} scout
     */
    public setScoutInstance(scout: Scout) {
        this.scout = scout;
    }
}

class NullIntegration extends RequireIntegration {
    protected readonly packageName: string = "";

    public ritmHook(exportBag: ExportBag): void {
        throw new Error("NullIntegration");
    }

    public setScoutInstance() {
        throw new Error("NullIntegration");
    }
}

export const doNothingRequireIntegration = new NullIntegration();
