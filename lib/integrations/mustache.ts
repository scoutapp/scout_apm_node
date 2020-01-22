import * as Hook from "require-in-the-middle";
import { ExportBag, RequireIntegration, scoutIntegrationSymbol } from "../types/integrations";
import { LogLevel, ScoutContextNames, ScoutSpanOperation } from "../types";
import * as Mustache from "mustache";

/**
 * Integration for the mustache package
 * https://www.npmjs.com/package/mustache
 *
 */
export class MustacheIntegration extends RequireIntegration {
    protected readonly packageName: string = "mustache";

    public ritmHook(exportBag: ExportBag): void {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // If the shim has already been run, then finish
            if (!exports || scoutIntegrationSymbol in exports) {
                return exports;
            }

            // Make changes to the mustache package to enable integration
            exports = this.shimMustache(exports);

            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;

            // Add the scoutIntegrationSymbol to the mysql export itself to show the shim was run
            exports[scoutIntegrationSymbol] = this;

            // Return the modified exports
            return exports;
        });
    }

    private shimMustache(mustacheExport: any): any {
        // Check if the shim has already been performed
        if (scoutIntegrationSymbol in mustacheExport) { return; }

        this.shimMustacheClass(mustacheExport);

        return mustacheExport;
    }

    /**
     * Shim for mustache's `render` function
     *
     * @param {any} mustacheExport - mustache's export
     */
    private shimMustacheClass(mustacheExport: any): any {
        const originalFn = mustacheExport.render;
        const integration = this;

        const render = function(this: typeof Mustache) {
            const originalArgs = arguments;
            integration.logFn("[scout/integrations/mustache] rendering...", LogLevel.Trace);

            // If no scout instance is available then run the function normally
            if (!integration.scout) { return originalFn.apply(this, originalArgs); }

            return integration.scout.instrumentSync(ScoutSpanOperation.TemplateRender, (span) => {
                span.addContextSync([{name: ScoutContextNames.Name, value: "<string>"}]);
                return originalFn.apply(this, originalArgs);
            });
        };

        mustacheExport.render = render;
        return mustacheExport;
    }
}

export default new MustacheIntegration();
