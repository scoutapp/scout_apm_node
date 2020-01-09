"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const require_in_the_middle_1 = require("require-in-the-middle");
exports.PACKAGE_NAME = "pg";
// Hook into the express and mongodb module
exports.default = {
    ritmHook: (exportBag) => {
        require_in_the_middle_1.default([exports.PACKAGE_NAME], function (exports, name, basedir) {
            // TODO: make changes to the pg package to enable integration
            // Save the exported package in the exportBag for Scout to use later
            exportBag[exports.PACKAGE_NAME] = exports;
            // Return the modified exports
            return exports;
        });
    }
};
