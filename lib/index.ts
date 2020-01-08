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
