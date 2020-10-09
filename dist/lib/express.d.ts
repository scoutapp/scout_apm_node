import { LogFn, ScoutConfiguration } from "./types";
import { Scout, ScoutRequest, ScoutSpan } from "./scout";
import { Request } from "express";
export interface ApplicationWithScout {
    scout?: Scout;
}
declare type ExpressMiddleware = (req: any, res: any, next: () => void) => void;
export interface ExpressMiddlewareOptions {
    config?: Partial<ScoutConfiguration>;
    logFn?: LogFn;
    requestTimeoutMs?: number;
    statisticsIntervalMS?: number;
    scout?: Scout;
    waitForScoutSetup?: boolean;
}
export interface ExpressScoutInfo {
    instance?: Scout;
    request?: ScoutRequest;
    rootSpan?: ScoutSpan;
}
export declare type ExpressRequestWithScout = Request & ExpressScoutInfo;
/**
 * Middleware for using scout, this should be
 * attached to the application object using app.use(...)
 *
 * @param {ScoutConfiguration} config - Express Request
 * @param {Function} logFn - Express Response
 * @returns {Function} a middleware function for use with express
 */
export declare function scoutMiddleware(opts?: ExpressMiddlewareOptions): ExpressMiddleware;
export {};
