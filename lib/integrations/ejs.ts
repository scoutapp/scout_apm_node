import * as path from "path";
import { ExportBag, RequireIntegration } from "../types/integrations";
import { Scout } from "../scout";
import { LogFn, LogLevel, ScoutContextName, ScoutSpanOperation } from "../types";
import * as Constants from "../constants";

// Hook into the express and mongodb module
export class EJSIntegration extends RequireIntegration {
    protected readonly packageName: string = "ejs";

    protected shim(ejsExport: any): any {
        this.shimEJSRender(ejsExport);
        this.shimEJSRenderFile(ejsExport);

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
                span.addContextSync([{name: ScoutContextName.Name, value: "<string>"}]);
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

            return integration.scout.instrument(ScoutSpanOperation.TemplateRender, (spanDone, {span}) => {
                const path = originalArgs[0];
                // If span wasn't available just run the original fn
                if (!span) {
                    integration.logFn(`[scout/integrations/ejs] no span for instrument...`, LogLevel.Trace);
                    return originalFn.apply(null, originalArgs);
                }

                span.addContextSync([{name: ScoutContextName.Name, value: path}]);

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

export default new EJSIntegration();
