import * as path from "path";
import * as Hook from "require-in-the-middle";
import { ExportBag, RequireIntegration, scoutIntegrationSymbol } from "../types/integrations";
import { Scout } from "../scout";
import { LogFn, LogLevel, ScoutContextNames, ScoutSpanOperation } from "../types";
import * as Constants from "../constants";

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

        this.shimMustacheRender(mustacheExport);
        this.shimMustacheRenderFile(mustacheExport);

        return mustacheExport;
    }

    /**
     * Shim for mustache's `render` function
     *
     * @param {any} mustacheExport - mustache's export
     */
    private shimMustacheRender(mustacheExport: any): any {
        const originalFn = mustacheExport.render;
        const integration = this;

        const render = (src, options, callback) => {
            const originalArgs = arguments;
            integration.logFn("[scout/integrations/mustache] rendering...", LogLevel.Debug);

            // If no scout instance is available then run the function normally
            if (!integration.scout) { return originalFn(src, options, callback); }

            return integration.scout.instrumentSync(ScoutSpanOperation.TemplateRender, (span) => {
                span.addContextSync([{name: ScoutContextNames.Name, value: "<string>"}]);
                return originalFn(src, options, callback);
            });
        };

        mustacheExport.render = render;
        return mustacheExport;
    }

    /**
     * Shim for mustache's `renderFile` function
     *
     * @param {any} mustacheExport - mustache's export
     */
    private shimMustacheRenderFile(mustacheExport: any): any {
        const originalFn = mustacheExport.renderFile;
        const integration = this;

        const renderFile = (path, options, callback) => {
            integration.logFn(`[scout/integrations/mustache] rendering file [${path}]...`, LogLevel.Debug);

            // If no scout instance is available then run the function normally
            if (!integration.scout) { return originalFn(path, options, callback); }

            return integration.scout.instrumentSync(ScoutSpanOperation.TemplateRender, (span) => {
                span.addContextSync([{name: ScoutContextNames.Name, value: path}]);
                return originalFn(path, options, callback);
            });
        };

        mustacheExport.renderFile = renderFile;
        return mustacheExport;
    }

}

export default new MustacheIntegration();
