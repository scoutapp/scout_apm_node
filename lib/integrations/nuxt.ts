import * as path from "path";
import { ExportBag, RequireIntegration } from "../types/integrations";
import { Scout } from "../scout";
import { LogFn, LogLevel, ScoutContextName, ScoutSpanOperation } from "../types";
import * as Constants from "../constants";

// Hook into the express and mongodb module
export class NuxtIntegration extends RequireIntegration {
    protected readonly packageName: string = "nuxt";

    protected shim(nuxtExport: any): any {
        nuxtExport = this.shimNuxtCtor(nuxtExport);

        return nuxtExport;
    }

    /**
     * Shim for nuxt's `Nuxt` constructor
     *
     * @param {any} nuxtExport - nuxt's export
     */
    private shimNuxtCtor(nuxtExport: any): any {
        const OriginalCtor = nuxtExport.Nuxt;
        const integration = this;

        // Create a constructor identical to the original Nuxt constructor
        const Nuxt = function Nuxt() {
            const originalArgs = arguments;
            integration.logFn("[scout/integrations/nuxt] Creating Nuxt object...", LogLevel.Debug);

            // Create the instance
            const instance = new OriginalCtor(...originalArgs);

            // We need to shim nuxt.render such that when it is called
            const originalRender = instance.render;
            instance.render = function render(req, res, next) {
                // If no scout instance is available then run the function normally
                if (!integration.scout) { return originalRender.apply(this, arguments); }

                // If we have context set up (we are in an async context and can obtain the current request)
                if (integration.scout.getCurrentRequest()) {
                    integration.logFn(
                        "[scout/integrations/nuxt] ScoutRequest present while serving [${req.url}]",
                        LogLevel.Debug,
                    );
                    return originalRender.apply(this, arguments);
                }

                // At this point, if a scout instance and there is no current scout request
                // that means any activity nuxt triggers (ex. HTTP requests with 'net')
                // are going to happen *without* a containg request/controller span this
                // happens because requests to Nuxt do *not* flow throw the normal
                // middleware flow of express/other integrations

                const url = req.url || "<unknown>";
                const method = req.method || "<unknown>";
                const controllerName = `Controller/${method.toUpperCase()} ${url}`;

                // Start a transaction that finished when res.end is called
                return integration.scout.transaction(controllerName, finishTransaction => {
                    // Ensure the integration and instrument functions are stil present by the time we run
                    if (!integration.scout || !integration.scout.instrument) {
                        integration.logFn(
                            "[scout/integrations/nuxt] Integration broken or missing instrument function",
                            LogLevel.Warn,
                        );
                        finishTransaction();
                        return originalRender.apply(this, [req, res, next]);
                    }

                    // Perform the instrumentation
                    return integration.scout.instrument(controllerName, () => {
                        // No need to finish the span explicitly since transaction finish will close interior spans
                        const originalResEnd = res.end;
                        res.end = function() {
                            finishTransaction();
                            return originalResEnd.apply(this, arguments);
                        };

                        return originalRender.apply(this, [req, res, next]);
                    });
                });
            };

            return instance;
        };

        // NOTE: we have to shim nuxt this way because the objects in it do *not* have setters
        const rebuiltNuxtExport = {Nuxt};
        Object.keys(nuxtExport)
            .filter(k => k !== "Nuxt")
            .forEach(k => rebuiltNuxtExport[k] = nuxtExport[k]);

        return rebuiltNuxtExport;
    }
}

export default new NuxtIntegration();
