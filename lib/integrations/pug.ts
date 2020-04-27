import * as path from "path";
import { ExportBag, RequireIntegration } from "../types/integrations";
import { Scout } from "../scout";
import { LogFn, LogLevel, ScoutContextName, ScoutSpanOperation } from "../types";
import * as Constants from "../constants";

// Hook into the express and mongodb module
export class PugIntegration extends RequireIntegration {
    protected readonly packageName: string = "pug";

    protected shim(pugExport: any): any {
        pugExport = this.shimPugRender(pugExport);
        pugExport = this.shimPugRenderFile(pugExport);

        return pugExport;
    }

    /**
     * Shim for pug's `render` function
     *
     * @param {any} pugExport - pug's export
     */
    private shimPugRender(pugExport: any): any {
        const originalFn = pugExport.render;
        const integration = this;

        const render = (src, options, callback) => {
            const originalArgs = arguments;
            integration.logFn("[scout/integrations/pug] rendering...", LogLevel.Debug);

            // If no scout instance is available then run the function normally
            if (!integration.scout) { return originalFn(src, options, callback); }

            return integration.scout.instrumentSync(ScoutSpanOperation.TemplateRender, ({span}) => {
                if (!span) { return originalFn.apply(null, originalArgs); }

                span.addContextSync(ScoutContextName.Name, "<string>");
                return originalFn(src, options, callback);
            });
        };

        pugExport.render = render;
        return pugExport;
    }

    /**
     * Shim for pug's `renderFile` function
     *
     * @param {any} pugExport - pug's export
     */
    private shimPugRenderFile(pugExport: any): any {
        const originalFn = pugExport.renderFile;
        const integration = this;

        const renderFile = function(path, options, callback) {
            // Pug does something weird -- if the callback is specified, it recursively calls renderFile
            // to avoid that, we need to do a similar check to know when to actually do the instrumentation versus not
            // we only want to do the instrumentation on the actual run (when callback is not defined)
            if (callback) { return originalFn(path, options, callback); }

            integration.logFn(`[scout/integrations/pug] rendering file [${path}]...`, LogLevel.Debug);

            // If no scout instance is available then run the function normally
            if (!integration.scout) {
                integration.logFn(
                    "[scout/integrations/pug] Failed to find integration's scout instance",
                    LogLevel.Warn,
                );
                return originalFn(path, options, callback);
            }

            return integration.scout.instrumentSync(ScoutSpanOperation.TemplateRender, ({span}) => {
                if (!span) { return originalFn(path, options, callback); }

                span.addContextSync(ScoutContextName.Name, path);
                return originalFn(path, options, callback);
            });
        };

        pugExport.renderFile = renderFile;
        pugExport.__express = pugExport.renderFile;
        return pugExport;
    }

}

export default new PugIntegration();
