import { LogFn, ScoutConfiguration } from "./types";
import { Scout } from "./scout";
export interface ApplicationWithScout {
    scout?: Scout;
}
declare type ExpressMiddleware = (req: any, res: any, next: () => void) => void;
export interface ExpressMiddlewareOptions {
    config?: Partial<ScoutConfiguration>;
    requestTimeoutMs?: number;
    logFn?: LogFn;
    scout?: Scout;
}
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
