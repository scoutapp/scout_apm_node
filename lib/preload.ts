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
import { getIntegrationForPackage, KNOWN_PACKAGES } from "./integrations";
import { EXPORT_BAG } from "./global";

KNOWN_PACKAGES.forEach(name => {
    const integration = getIntegrationForPackage(name);
    if (integration) {
        integration.ritmHook(EXPORT_BAG);
    }
});
