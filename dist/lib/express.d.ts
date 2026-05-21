import { LogFn, ScoutConfiguration } from "./types";
import { Scout, ScoutRequest, ScoutSpan } from "./scout";
import { Request } from "express";
export interface EndpointInfo {
    path: string;
    methods: string[];
    middleware?: string[];
    regex?: RegExp;
}
/**
 * List all endpoints registered on an Express app.
 * Works with both Express 4 and Express 5.
 *
 * Express 5 changed the internal router structure:
 * - app.router instead of app._router
 * - layer.matchers[] instead of layer.regexp
 *
 * The express-list-endpoints library doesn't support Express 5,
 * so we implement our own walker for Express 5 and fall back to the library for Express 4.
 */
export declare function listExpressEndpoints(app: any): EndpointInfo[];
export interface ApplicationWithScout {
    scout?: Scout;
}
type ExpressMiddleware = (req: any, res: any, next: () => void) => void;
type ExpressErrorMiddleware = (err: any, req: any, res: any, next: (err?: any) => void) => void;
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
export type ExpressRequestWithScout = Request & ExpressScoutInfo;
/**
 * Middleware for using scout, this should be
 * attached to the application object using app.use(...)
 *
 * @param {ScoutConfiguration} config - Express Request
 * @param {Function} logFn - Express Response
 * @returns {Function} a middleware function for use with express
 */
export declare function scoutMiddleware(opts?: ExpressMiddlewareOptions): ExpressMiddleware;
/**
 * Express 4-arg error-handling middleware.
 * Place after all other app.use()/routes so Express routes errors through it.
 * Captures the error to Scout error monitoring, then calls next(err) so the
 * default Express error handler (or any downstream handler) still runs.
 */
export declare function errorMiddleware(): ExpressErrorMiddleware;
export {};
