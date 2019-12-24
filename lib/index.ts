export * from "./scout";

export {
    AgentEvent as ScoutAgentEvent,
    ApplicationMetadata,
    buildScoutConfiguration,
    consoleLogFn,
} from "./types";

export {
    ExpressMiddlewareOptions as ScoutExpressOptions,
    scoutMiddleware as expressMiddleware,
} from "./express";

export * from "./errors";
