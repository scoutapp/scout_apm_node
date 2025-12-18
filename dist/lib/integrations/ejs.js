"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EJSIntegration = void 0;
const path = __importStar(require("path"));
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
                // Run the rendering function (it is callback based)
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
