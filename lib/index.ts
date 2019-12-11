export * from "./scout";

export {
    AgentEvent as ScoutAgentEvent,
    buildScoutConfiguration,
    consoleLogFn,
} from "./types";

export {
    ExpressMiddlewareOptions as ScoutExpressOptions,
    scoutMiddleware as expressMiddleware,
} from "./express";

export * from "./errors";
