"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Hook = require("require-in-the-middle");
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
// Hook into the express and mongodb module
class PugIntegration {
    constructor() {
        this.packageName = "pug";
        this.logFn = () => undefined;
    }
    getPackageName() {
        return this.packageName;
    }
    ritmHook(exportBag) {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // If the shim has already been run, then finish
            if (!exports || integrations_1.scoutIntegrationSymbol in exports) {
                return exports;
            }
            // Make changes to the pug package to enable integration
            exports = this.shimPug(exports);
            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;
            // Add the scoutIntegrationSymbol to the mysql export itself to show the shim was run
            exports[integrations_1.scoutIntegrationSymbol] = this;
            // Return the modified exports
            return exports;
        });
    }
    setScoutInstance(scout) {
        this.scout = scout;
    }
    setLogFn(logFn) {
        this.logFn = logFn;
    }
    shimPug(pugExport) {
        // Check if the shim has already been performed
        if (integrations_1.scoutIntegrationSymbol in pugExport) {
            return;
        }
        this.shimPugRender(pugExport);
        this.shimPugRenderFile(pugExport);
        return pugExport;
    }
    /**
     * Shim for pug's `render` function
     *
     * @param {any} pugExport - pug's export
     */
    shimPugRender(pugExport) {
        const originalFn = pugExport.render;
        const integration = this;
        const render = () => {
            integration.logFn("[scout/integrations/pug] rendering...", types_1.LogLevel.Debug);
            const result = originalFn(...arguments);
            return result;
        };
        pugExport.render = render;
        return pugExport;
    }
    /**
     * Shim for pug's `renderFile` function
     *
     * @param {any} pugExport - pug's export
     */
    shimPugRenderFile(pugExport) {
        const originalFn = pugExport.render;
        const integration = this;
        const renderFile = () => {
            const file = arguments[0];
            integration.logFn(`[scout/integrations/pug] rendering file [${file}]...`, types_1.LogLevel.Debug);
            const result = originalFn(...arguments);
            return result;
        };
        pugExport.renderFile = renderFile;
        return pugExport;
    }
}
exports.PugIntegration = PugIntegration;
exports.default = new PugIntegration();
