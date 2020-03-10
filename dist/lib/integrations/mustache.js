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
        mustacheExport = this.shimMustacheClass(mustacheExport);
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
            return integration.scout.instrumentSync(types_1.ScoutSpanOperation.TemplateRender, ({ span }) => {
                if (!span) {
                    return originalFn.apply(null, originalArgs);
                }
                span.addContextSync(types_1.ScoutContextName.Name, "<string>");
                return originalFn.apply(this, originalArgs);
            });
        };
        mustacheExport.render = render;
        return mustacheExport;
    }
}
exports.MustacheIntegration = MustacheIntegration;
exports.default = new MustacheIntegration();
