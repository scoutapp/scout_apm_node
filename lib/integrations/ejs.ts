import * as path from "path";
import { ExportBag, RequireIntegration } from "../types/integrations";
import { Scout } from "../scout";
import { LogFn, LogLevel, ScoutContextName, ScoutSpanOperation } from "../types";
import * as Constants from "../constants";

// Hook into the express and mongodb module
export class EJSIntegration extends RequireIntegration {
    protected readonly packageName: string = "ejs";

    protected shim(ejsExport: any): any {
        ejsExport = this.shimEJSRender(ejsExport);
        ejsExport = this.shimEJSRenderFile(ejsExport);

        return ejsExport;
    }

    /**
     * Shim for ejs's `render` function
     *
     * @param {any} ejsExport - ejs's export
     */
    private shimEJSRender(ejsExport: any): any {
        const originalFn = ejsExport.render;
        const integration = this;

        const render = function() {
            const originalArgs = arguments;
            integration.logFn("[scout/integrations/ejs] rendering...", LogLevel.Debug);

            // If no scout instance is available then run the function normally
            if (!integration.scout) { return originalFn.apply(null, originalArgs); }

            return integration.scout.instrumentSync(ScoutSpanOperation.TemplateRender, (span) => {
                span.addContextSync(ScoutContextName.Name, "<string>");
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
    private shimEJSRenderFile(ejsExport: any): any {
        const originalFn = ejsExport.renderFile;
        const integration = this;

        const renderFile = function() {
            const originalArgs = arguments;
            integration.logFn(`[scout/integrations/ejs] rendering file [${path}]...`, LogLevel.Trace);

            // If no scout instance is available then run the function normally
            if (!integration.scout) { return originalFn.apply(null, originalArgs); }

            // We need to find which one of the arguments was the callback if there was one)
            const originalArgsArr = Array.from(originalArgs);
            const cbIdx = originalArgsArr.findIndex(a => typeof a === "function");
            // If a callback wasn't provided use a function that does nothing
            const cbProvided = cbIdx >= 0;
            const cb = cbProvided ? originalArgsArr[cbIdx] : () => undefined;

            return integration.scout.instrument(ScoutSpanOperation.TemplateRender, (spanDone, {request, span}) => {
                const path = originalArgs[0];

                // If span wasn't available just run the original fn
                if (!span) {
                    integration.logFn(`[scout/integrations/ejs] no span for instrument...`, LogLevel.Trace);
                    return originalFn.apply(null, originalArgs);
                }

                // Add context of the file path
                span.addContextSync(ScoutContextName.Name, path);

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
                const wrappedCb = function() {
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

export default new EJSIntegration();
