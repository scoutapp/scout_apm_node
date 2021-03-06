import * as Hook from "require-in-the-middle";

import { Scout } from "../scout";
import { LogFn } from "./util";
import * as Errors from "../errors";
import { LogLevel } from "../types/enum";

import { getActiveGlobalScoutInstance } from "../global";

let SYMBOL: symbol;

export function getIntegrationSymbol(): symbol {
    if (SYMBOL) { return SYMBOL; }
    SYMBOL = Symbol("scout");
    return SYMBOL;
}

export interface ExportBag {
    [key: string]: any;
}

export abstract class RequireIntegration {
    protected readonly packageName: string;
    protected scoutInstance: Scout;
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
     * Perform the require-in-the-middle Hook() that will set up the integration.
     *
     * @param {ExportBag} exportBag - The bag of exports that have been shimmed by scout already
     */
    public ritmHook(exportBag: ExportBag): void {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // Set the scout instsance to the global one if there is one
            // this is needed in cases where require()s are run dynamically, long after scout.setup()
            // we assume that scout.setup() will set *one* instance of scout to be the global one
            const globalScoutInstance = getActiveGlobalScoutInstance();
            if (globalScoutInstance) {
                this.setScoutInstance(globalScoutInstance);
            } else {
                if (this.logFn) {
                    this.logFn(
                        `global scout instance not found while setting up integration for package [${name}]`,
                        LogLevel.Warn,
                    );
                }
            }

            // If the shim has already been run, then finish
            if (!exports || getIntegrationSymbol() in exports) {
                return exports;
            }

            const sym = getIntegrationSymbol();

            // Check if the shim has already been performed
            if (sym in exports) { return exports; }

            // Make changes to the mysql2 package to enable integration
            exports = this.shim(exports);
            if (!exports) { throw new Error("Failed to shim export"); }

            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;

            // Add the getIntegrationSymbol() to the mysql export itself to show the shim was run
            exports[sym] = this;

            // Return the modified exports
            return exports;
        });
    }

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
    public setLogFn(logFn: LogFn) {
        this.logFn = logFn;
    }

    /**
     * Set a *custom*, specific scout instance for the integration
     *
     * @param {Scout} scout
     */
    public setScoutInstance(scout: Scout) {
        if (!scout) { return; }
        this.scoutInstance = scout;
    }

    /**
     * Custom getter for scout property
     * if a custom specific scout instance is provided, use that, if not use the default
     *
     * @returns {Scout | null}
     */
    public get scout() {
        if (this.scoutInstance) { return this.scoutInstance; }
        return getActiveGlobalScoutInstance();
    }
}

class NullIntegration extends RequireIntegration {
    protected readonly packageName: string = "";

    protected shim(someExport: any): any {
        throw new Error("NullIntegration");
    }

    public setScoutInstance() {
        throw new Error("NullIntegration");
    }
}

export const doNothingRequireIntegration = new NullIntegration();
