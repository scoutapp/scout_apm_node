"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
    shim(mustacheExport) {
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
