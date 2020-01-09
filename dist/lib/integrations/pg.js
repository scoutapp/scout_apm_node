"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Hook = require("require-in-the-middle");
exports.PACKAGE_NAME = "pg";
// Hook into the express and mongodb module
class PGIntegration {
    constructor() {
        this.packageName = exports.PACKAGE_NAME;
    }
    getPackageName() {
        return this.packageName;
    }
    ritmHook(exportBag) {
        Hook([exports.PACKAGE_NAME], (exports, name, basedir) => {
            // TODO: make changes to the pg package to enable integration
            // Save the exported package in the exportBag for Scout to use later
            exportBag[exports.PACKAGE_NAME] = exports;
            // Return the modified exports
            return exports;
        });
    }
    setScoutInstance(scout) {
        this.scout = scout;
    }
}
exports.PGIntegration = PGIntegration;
exports.default = new PGIntegration();
