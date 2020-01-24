export {
    Scout,
    ScoutRequest,
    ScoutSpan,
    ScoutEventRequestSentData,
} from "./scout";

export {
    AgentEvent as ScoutAgentEvent,
    ScoutEvent,
    ApplicationMetadata,
    buildScoutConfiguration,
    LogLevel,
    consoleLogFn,
    buildWinstonLogFn,
} from "./types";

export {
    ExpressMiddlewareOptions as ScoutExpressOptions,
    scoutMiddleware as expressMiddleware,
} from "./express";

export * from "./errors";

import { Scout } from "./scout";
import { ScoutConfiguration, buildScoutConfiguration } from "./types";
import { ExportBag } from "./types/integrations";
import { getIntegrationForPackage } from "./integrations";
import { setGlobalScoutInstance, getGlobalScoutInstance } from "./global";

// Create an export bag which will contain
export const EXPORT_BAG: ExportBag = {};

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

    // NodeJS internals
    "http",
]);
