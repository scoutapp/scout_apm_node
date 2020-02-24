export * from "./errors";

import { Scout } from "./scout";
import { ScoutConfiguration, buildScoutConfiguration } from "./types";
import { getIntegrationForPackage } from "./integrations";
import { setGlobalScoutInstance, getGlobalScoutInstance, EXPORT_BAG } from "./global";

// Set up PG integration
// This is needed for use in Typescript projects since `import` will not
// run global code unless you do a whole-file import
export function setupRequireIntegrations(packages: string[], scoutConfig?: Partial<ScoutConfiguration>) {
    packages = packages || [];

    // If we're setting up the scout require integrations, let's build a scout instance
    if (!getGlobalScoutInstance()) {
        setGlobalScoutInstance(new Scout(buildScoutConfiguration(scoutConfig)));
    }

    packages.forEach(name => {
        const integration = getIntegrationForPackage(name);
        if (integration) {
            integration.ritmHook(EXPORT_BAG);
            integration.setScoutInstance(getGlobalScoutInstance());
        }
    });
}

// For pure NodeJS contexts this will be run automatically
setupRequireIntegrations([
    // Databases
    "pg",
    "mysql",
    "mysql2",

    // Templating
    "pug",
    "mustache",
    "ejs",

    // Web frameworks
    "express",

    // NodeJS internals
    "http",
]);
