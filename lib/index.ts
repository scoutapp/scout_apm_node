export * from "./scout";

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
import pgIntegration from "./integrations/pg";

// Create an export bag which will contain
const exportBag: ExportBag = {};

// Set up PG integration
pgIntegration.ritmHook(exportBag);
