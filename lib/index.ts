export * from "./scout";

export {
    ScoutConfiguration,
    AgentEvent as ScoutAgentEvent,
} from "./types";

export {
    ExpressMiddlewareOptions as ScoutExpressOptions,
    scoutMiddleware as expressMiddleware,
} from "./express";
