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
        ejsExport = this.shimEJSRender(ejsExport);
        ejsExport = this.shimEJSRenderFile(ejsExport);
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
            return integration.scout.instrumentSync(types_1.ScoutSpanOperation.TemplateRender, ({ span }) => {
                if (!span) {
                    return originalFn.apply(null, originalArgs);
                }
                span.addContextSync(types_1.ScoutContextName.Name, "<string>");
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
            // We need to find which one of the arguments was the callback if there was one)
            const originalArgsArr = Array.from(originalArgs);
            const cbIdx = originalArgsArr.findIndex(a => typeof a === "function");
            // If a callback wasn't provided use a function that does nothing
            const cbProvided = cbIdx >= 0;
            const cb = cbProvided ? originalArgsArr[cbIdx] : () => undefined;
            return integration.scout.instrument(types_1.ScoutSpanOperation.TemplateRender, (spanDone, { request, span }) => {
                const path = originalArgs[0];
                // If span wasn't available just run the original fn
                if (!span) {
                    integration.logFn(`[scout/integrations/ejs] no span for instrument...`, types_1.LogLevel.Trace);
                    return originalFn.apply(null, originalArgs);
                }
                // Add context of the file path
                span.addContextSync(types_1.ScoutContextName.Name, path);
                // After making the wrapped cb, replace the argument in the originalArgs array
                if (!cbProvided) {
                    // if a callback wasn't provided then promise mode is being used
                    return originalFn.apply(null, originalArgs)
                        .then(res => {
                        spanDone();
                        return res;
                    });
                }
                // Wrap the callback (provided or do-nothing) with a callback that will run the orignal CB
                const wrappedCb = function () {
                    spanDone();
                    cb.apply(null, arguments);
                };
                // If a callback *was* provided we need to use a wrapped version
                originalArgs[cbIdx] = wrappedCb;
                // Run the rendering function
                originalFn.apply(null, originalArgs);
            });
        };
        ejsExport.renderFile = renderFile;
        ejsExport.__express = renderFile;
        return ejsExport;
    }
}
exports.EJSIntegration = EJSIntegration;
exports.default = new EJSIntegration();
