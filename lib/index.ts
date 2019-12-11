export * from "./scout";

export {
    AgentEvent as ScoutAgentEvent,
    buildScoutConfiguration,
} from "./types";

export {
    ExpressMiddlewareOptions as ScoutExpressOptions,
    scoutMiddleware as expressMiddleware,
} from "./express";

export * from "./errors";
