export { Scout, ScoutRequest, ScoutSpan, ScoutEventRequestSentData, } from "./scout";
export { AgentEvent as ScoutAgentEvent, ScoutEvent, ApplicationMetadata, buildScoutConfiguration, LogLevel, consoleLogFn, buildWinstonLogFn, } from "./types";
export { ExpressMiddlewareOptions as ScoutExpressOptions, scoutMiddleware as expressMiddleware, } from "./express";
export * from "./errors";
import { ScoutConfiguration } from "./types";
import { ExportBag } from "./types/integrations";
export declare const EXPORT_BAG: ExportBag;
export declare function setupRequireIntegrations(packages: string[], scoutConfig?: Partial<ScoutConfiguration>): void;
