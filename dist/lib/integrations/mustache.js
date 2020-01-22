"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Hook = require("require-in-the-middle");
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
/**
 * Integration for the mustache package
 * https://www.npmjs.com/package/mustache
 *
 */
class MustacheIntegration extends integrations_1.RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "mustache";
    }
    ritmHook(exportBag) {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // If the shim has already been run, then finish
            if (!exports || integrations_1.scoutIntegrationSymbol in exports) {
                return exports;
            }
            // Make changes to the mustache package to enable integration
            exports = this.shimMustache(exports);
            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;
            // Add the scoutIntegrationSymbol to the mysql export itself to show the shim was run
            exports[integrations_1.scoutIntegrationSymbol] = this;
            // Return the modified exports
            return exports;
        });
    }
    shimMustache(mustacheExport) {
        // Check if the shim has already been performed
        if (integrations_1.scoutIntegrationSymbol in mustacheExport) {
            return;
        }
        this.shimMustacheClass(mustacheExport);
        return mustacheExport;
    }
    /**
     * Shim for mustache's `render` function
     *
     * @param {any} mustacheExport - mustache's export
     */
    shimMustacheClass(mustacheExport) {
        const originalFn = mustacheExport.render;
        const integration = this;
        const render = function () {
            const originalArgs = arguments;
            integration.logFn("[scout/integrations/mustache] rendering...", types_1.LogLevel.Trace);
            // If no scout instance is available then run the function normally
            if (!integration.scout) {
                return originalFn.apply(this, originalArgs);
            }
            return integration.scout.instrumentSync(types_1.ScoutSpanOperation.TemplateRender, (span) => {
                span.addContextSync([{ name: types_1.ScoutContextNames.Name, value: "<string>" }]);
                return originalFn.apply(this, originalArgs);
            });
        };
        mustacheExport.render = render;
        return mustacheExport;
    }
}
exports.MustacheIntegration = MustacheIntegration;
exports.default = new MustacheIntegration();
