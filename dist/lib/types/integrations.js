"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.doNothingRequireIntegration = exports.RequireIntegration = exports.getIntegrationSymbol = void 0;
const Hook = require("require-in-the-middle");
const enum_1 = require("../types/enum");
const global_1 = require("../global");
let SYMBOL;
function getIntegrationSymbol() {
    if (SYMBOL) {
        return SYMBOL;
    }
    SYMBOL = Symbol("scout");
    return SYMBOL;
}
exports.getIntegrationSymbol = getIntegrationSymbol;
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
            // Set the scout instsance to the global one if there is one
            // this is needed in cases where require()s are run dynamically, long after scout.setup()
            // we assume that scout.setup() will set *one* instance of scout to be the global one
            const globalScoutInstance = global_1.getActiveGlobalScoutInstance();
            if (globalScoutInstance) {
                this.setScoutInstance(globalScoutInstance);
            }
            else {
                if (this.logFn) {
                    this.logFn(`global scout instance not found while setting up integration for package [${name}]`, enum_1.LogLevel.Warn);
                }
            }
            // If the shim has already been run, then finish
            if (!exports || getIntegrationSymbol() in exports) {
                return exports;
            }
            const sym = getIntegrationSymbol();
            // Check if the shim has already been performed
            if (sym in exports) {
                return exports;
            }
            // Make changes to the mysql2 package to enable integration
            exports = this.shim(exports);
            if (!exports) {
                throw new Error("Failed to shim export");
            }
            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;
            // Add the getIntegrationSymbol() to the mysql export itself to show the shim was run
            exports[sym] = this;
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
     * Set a *custom*, specific scout instance for the integration
     *
     * @param {Scout} scout
     */
    setScoutInstance(scout) {
        if (!scout) {
            return;
        }
        this.scoutInstance = scout;
    }
    /**
     * Custom getter for scout property
     * if a custom specific scout instance is provided, use that, if not use the default
     *
     * @returns {Scout | null}
     */
    get scout() {
        if (this.scoutInstance) {
            return this.scoutInstance;
        }
        return global_1.getActiveGlobalScoutInstance();
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
