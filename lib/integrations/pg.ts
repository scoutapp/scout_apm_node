import * as path from "path";
import * as Hook from "require-in-the-middle";
import { ExportBag, RequireIntegration } from "../types/integrations";
import { Scout } from "../scout";

export const PACKAGE_NAME = "pg";

// Hook into the express and mongodb module
export class PGIntegration implements RequireIntegration {
    private readonly packageName: string = PACKAGE_NAME;
    private scout: Scout;

    public getPackageName() {
        return this.packageName;
    }

    public ritmHook(exportBag: ExportBag): void {
        Hook([PACKAGE_NAME], (exports, name, basedir) => {
            // TODO: make changes to the pg package to enable integration

            // Save the exported package in the exportBag for Scout to use later
            exportBag[PACKAGE_NAME] = exports;

            // Return the modified exports
            return exports;
        });
    }

    public setScoutInstance(scout: Scout) {
        this.scout = scout;
    }
}

export default new PGIntegration();
