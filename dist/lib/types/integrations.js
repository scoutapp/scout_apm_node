"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoutIntegrationSymbol = Symbol("scout");
class NullIntegration {
    constructor() {
        this.packageName = "";
    }
    getPackageName() { return this.packageName; }
    ritmHook(exportBag) {
        throw new Error("NullIntegration");
    }
    setScoutInstance() {
        throw new Error("NullIntegration");
    }
}
exports.doNothingRequireIntegration = new NullIntegration();
