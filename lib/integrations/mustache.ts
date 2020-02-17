import { ExportBag, RequireIntegration } from "../types/integrations";
import { LogLevel, ScoutContextName, ScoutSpanOperation } from "../types";
import * as Mustache from "mustache";

/**
 * Integration for the mustache package
 * https://www.npmjs.com/package/mustache
 *
 */
export class MustacheIntegration extends RequireIntegration {
    protected readonly packageName: string = "mustache";

    protected shim(mustacheExport: any): any {
        mustacheExport = this.shimMustacheClass(mustacheExport);

        return mustacheExport;
    }

    /**
     * Shim for mustache's `render` function
     *
     * @param {any} mustacheExport - mustache's export
     */
    private shimMustacheClass(mustacheExport: any): any {
        const originalFn = mustacheExport.render;
        const integration = this;

        const render = function(this: typeof Mustache) {
            const originalArgs = arguments;
            integration.logFn("[scout/integrations/mustache] rendering...", LogLevel.Trace);

            // If no scout instance is available then run the function normally
            if (!integration.scout) { return originalFn.apply(this, originalArgs); }

            return integration.scout.instrumentSync(ScoutSpanOperation.TemplateRender, (span) => {
                span.addContextSync({name: ScoutContextName.Name, value: "<string>"});
                return originalFn.apply(this, originalArgs);
            });
        };

        mustacheExport.render = render;
        return mustacheExport;
    }
}

export default new MustacheIntegration();
