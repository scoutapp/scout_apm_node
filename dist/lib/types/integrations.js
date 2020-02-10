"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Hook = require("require-in-the-middle");
exports.scoutIntegrationSymbol = Symbol("scout");
class RequireIntegration {
    constructor() {
        this.logFn = () => undefined;
    }
    /**
     * Retrieve the name of the require integration
     *
     * @returns {string} the name of this integration
     */
    getPackageName() {
        return this.packageName;
    }
    /**
     * Perform the require-in-the-middle Hook() that will set up the integration.
     *
     * @param {ExportBag} exportBag - The bag of exports that have been shimmed by scout already
     */
    ritmHook(exportBag) {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // If the shim has already been run, then finish
            if (!exports || exports.scoutIntegrationSymbol in exports) {
                return exports;
            }
            // Make changes to the mysql2 package to enable integration
            exports = this.shim(exports);
            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;
            // Add the scoutIntegrationSymbol to the mysql export itself to show the shim was run
            exports[exports.scoutIntegrationSymbol] = this;
            // Return the modified exports
            return exports;
        });
    }
    /**
     * Set the logging function for the require integration
     *
     * @param {LogFn} logFn
     */
    setLogFn(logFn) {
        this.logFn = logFn;
    }
    /**
     * Set the scout instance for the integration
     *
     * @param {Scout} scout
     */
    setScoutInstance(scout) {
        this.scout = scout;
    }
}
exports.RequireIntegration = RequireIntegration;
class NullIntegration extends RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "";
    }
    shim(someExport) {
        throw new Error("NullIntegration");
    }
    setScoutInstance() {
        throw new Error("NullIntegration");
    }
}
exports.doNothingRequireIntegration = new NullIntegration();
