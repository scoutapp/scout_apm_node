import * as path from "path";
import * as Hook from "require-in-the-middle";
import { ExportBag, RequireIntegration, scoutIntegrationSymbol } from "../types/integrations";
import { Scout } from "../scout";
import { render } from "pug";
import { LogFn, LogLevel, ScoutContextNames } from "../types";
import * as Constants from "../constants";

// Hook into the express and mongodb module
export class PugIntegration implements RequireIntegration {
    private readonly packageName: string = "pug";
    private scout: Scout;
    private logFn: LogFn = () => undefined;

    public getPackageName() {
        return this.packageName;
    }

    public ritmHook(exportBag: ExportBag): void {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // If the shim has already been run, then finish
            if (!exports || scoutIntegrationSymbol in exports) {
                return exports;
            }

            // Make changes to the pug package to enable integration
            exports = this.shimPug(exports);

            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;

            // Add the scoutIntegrationSymbol to the mysql export itself to show the shim was run
            exports[scoutIntegrationSymbol] = this;

            // Return the modified exports
            return exports;
        });
    }

    public setScoutInstance(scout: Scout) {
        this.scout = scout;
    }

    public setLogFn(logFn: LogFn) {
        this.logFn = logFn;
    }

    private shimPug(pugExport: any): any {
        // Check if the shim has already been performed
        if (scoutIntegrationSymbol in pugExport) { return; }

        this.shimPugRender(pugExport);
        this.shimPugRenderFile(pugExport);

        return pugExport;
    }

    /**
     * Shim for pug's `render` function
     *
     * @param {any} pugExport - pug's export
     */
    private shimPugRender(pugExport: any): any {
        const originalFn = pugExport.render;
        const integration = this;

        const render = () => {
            integration.logFn("[scout/integrations/pug] rendering...", LogLevel.Debug);

            const result = originalFn(...arguments);
            return result;
        };

        pugExport.render = render;
        return pugExport;
    }

    /**
     * Shim for pug's `renderFile` function
     *
     * @param {any} pugExport - pug's export
     */
    private shimPugRenderFile(pugExport: any): any {
        const originalFn = pugExport.render;
        const integration = this;

        const renderFile = () => {
            const file = arguments[0];
            integration.logFn(`[scout/integrations/pug] rendering file [${file}]...`, LogLevel.Debug);

            const result = originalFn(...arguments);
            return result;
        };

        pugExport.renderFile = renderFile;
        return pugExport;
    }

}

export default new PugIntegration();
