"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const Hook = require("require-in-the-middle");
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
// Hook into the express and mongodb module
class EJSIntegration extends integrations_1.RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "ejs";
    }
    ritmHook(exportBag) {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // If the shim has already been run, then finish
            if (!exports || integrations_1.scoutIntegrationSymbol in exports) {
                return exports;
            }
            // Make changes to the ejs package to enable integration
            exports = this.shimEJS(exports);
            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;
            // Add the scoutIntegrationSymbol to the mysql export itself to show the shim was run
            exports[integrations_1.scoutIntegrationSymbol] = this;
            // Return the modified exports
            return exports;
        });
    }
    shimEJS(ejsExport) {
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
        return ejsExport;
    }
}
exports.EJSIntegration = EJSIntegration;
exports.default = new EJSIntegration();
