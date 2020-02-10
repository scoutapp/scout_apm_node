"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
// Hook into the express and mongodb module
class EJSIntegration extends integrations_1.RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "ejs";
    }
    shim(ejsExport) {
        // Check if the shim has already been performed
        if (integrations_1.scoutIntegrationSymbol in ejsExport) {
            return;
        }
        this.shimEJSRender(ejsExport);
        this.shimEJSRenderFile(ejsExport);
        return ejsExport;
    }
    /**
     * Shim for ejs's `render` function
     *
     * @param {any} ejsExport - ejs's export
     */
    shimEJSRender(ejsExport) {
        const originalFn = ejsExport.render;
        const integration = this;
        const render = function () {
            const originalArgs = arguments;
            integration.logFn("[scout/integrations/ejs] rendering...", types_1.LogLevel.Debug);
            // If no scout instance is available then run the function normally
            if (!integration.scout) {
                return originalFn.apply(null, originalArgs);
            }
            return integration.scout.instrumentSync(types_1.ScoutSpanOperation.TemplateRender, (span) => {
                span.addContextSync([{ name: types_1.ScoutContextNames.Name, value: "<string>" }]);
                return originalFn.apply(null, originalArgs);
            });
        };
        ejsExport.render = render;
        return ejsExport;
    }
    /**
     * Shim for ejs's `renderFile` function
     *
     * @param {any} ejsExport - ejs's export
     */
    shimEJSRenderFile(ejsExport) {
        const originalFn = ejsExport.renderFile;
        const integration = this;
        const renderFile = function () {
            const originalArgs = arguments;
            integration.logFn(`[scout/integrations/ejs] rendering file [${path}]...`, types_1.LogLevel.Trace);
            // If no scout instance is available then run the function normally
            if (!integration.scout) {
                return originalFn.apply(null, originalArgs);
            }
            return integration.scout.instrument(types_1.ScoutSpanOperation.TemplateRender, (spanDone, { span }) => {
                const path = originalArgs[0];
                // If span wasn't available just run the original fn
                if (!span) {
                    integration.logFn(`[scout/integrations/ejs] no span for instrument...`, types_1.LogLevel.Trace);
                    return originalFn.apply(null, originalArgs);
                }
                span.addContextSync([{ name: types_1.ScoutContextNames.Name, value: path }]);
                return originalFn
                    .apply(null, originalArgs)
                    .then(result => {
                    spanDone();
                    return result;
                });
            });
        };
        ejsExport.renderFile = renderFile;
        ejsExport.__express = renderFile;
        return ejsExport;
    }
}
exports.EJSIntegration = EJSIntegration;
exports.default = new EJSIntegration();
