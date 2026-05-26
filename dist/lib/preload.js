"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Preload entry point for `node --require @scout_apm/scout-apm/preload`.
 *
 * Registers RITM hooks for all known packages before any user code runs.
 * Full Scout configuration happens later when you call install() or init()
 * in your application code.
 *
 * Usage:
 *   node --require @scout_apm/scout-apm/preload app.js
 */
const integrations_1 = require("./integrations");
const global_1 = require("./global");
integrations_1.KNOWN_PACKAGES.forEach(name => {
    const integration = (0, integrations_1.getIntegrationForPackage)(name);
    if (integration) {
        integration.ritmHook(global_1.EXPORT_BAG);
    }
});
