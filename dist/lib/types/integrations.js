"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
    ritmHook(exportBag) {
        throw new Error("NullIntegration");
    }
    setScoutInstance() {
        throw new Error("NullIntegration");
    }
}
exports.doNothingRequireIntegration = new NullIntegration();
