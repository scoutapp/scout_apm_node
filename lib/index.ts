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

import { ExportBag } from "./types/integrations";
import { getIntegrationForPackage } from "./integrations";
import pgIntegration from "./integrations/pg";

// Create an export bag which will contain
export const EXPORT_BAG: ExportBag = {};

// Set up PG integration
// This is needed for use in Typescript projects since `import` will not
// run global code unless you do a whole-file import
export function setupRequireIntegrations(packages: string[]) {
    packages = packages || [];
    packages.forEach(name => {
        const integration = getIntegrationForPackage(name);
        if (integration) {
            integration.ritmHook(EXPORT_BAG);
        }
    });
}

// For pure NodeJS contexts this will be run automatically
setupRequireIntegrations([
    "pg",
    "mysql",
]);
