import * as path from "path";
import Hook from "require-in-the-middle";
import { RequireIntegration } from "../types/integrations";

export const PACKAGE_NAME = "pg";

// Hook into the express and mongodb module
export default {
    ritmHook: (exportBag) => {
        Hook([PACKAGE_NAME], (exports, name, basedir) => {
            // TODO: make changes to the pg package to enable integration

            // Save the exported package in the exportBag for Scout to use later
            exportBag[PACKAGE_NAME] = exports;

            // Return the modified exports
            return exports;
        });
    },
} as RequireIntegration;
