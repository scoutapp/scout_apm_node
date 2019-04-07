import * as onFinished from "on-finished";
import { LogLevel, ScoutConfiguration, LogFn } from "./types";
import * as Constants from "./constants";
import { Scout, ScoutRequest } from "./scout";

export interface ApplicationWithScout {
    scout?: Scout;
}

type ExpressMiddleware = (req: any, res: any, next: () => void) => void;

/**
 * Default implementation for logging simple messages to console
 *
 * @param {string} message
 * @param {LogLevel} level
 */
export function consoleLogFn(message: string, level?: LogLevel) {
    level = level || LogLevel.Info;

    switch (level) {
        case LogLevel.Warn:
            console.warn(message); // tslint:disable-line no-console
            break;
        case LogLevel.Error:
            console.error(message); // tslint:disable-line no-console
            break;
        case LogLevel.Debug:
            console.debug(message); // tslint:disable-line no-console
            break;
        case LogLevel.Trace:
            console.trace(message); // tslint:disable-line no-console
            break;
        default:
            console.log(message); // tslint:disable-line no-console
    }
}

export interface ExpressMiddlewareOptions {
    config?: ScoutConfiguration;
    requestTimeoutMs?: number;
    logFn?: LogFn;
}

/**
 * Middleware for using scout, this should be
 * attached to the application object using app.use(...)
 *
 * @param {ScoutConfiguration} config - Express Request
 * @param {Function} logFn - Express Response
 * @returns {Function} a middleware function for use with express
 */
export function scoutMiddleware(opts?: ExpressMiddlewareOptions): ExpressMiddleware {
    return (req: any, res: any, next: () => void) => {
        // Exit early if we cannot access the application from the request
        if (!req || !req.app) {
            if (opts && opts.logFn) {
                opts.logFn(`[scout] Request object is missing/invalid (application object missing)`, LogLevel.Warn);
            }
            next();
            return;
        }

        let getScout: () => Promise<Scout> = () => Promise.resolve(req.app.scout);
        // Create the scout agent if not present on the app
        if (!req.app.scout) {
            getScout = () => {
                // Use custom scout configuration if provided
                const config = opts && opts.config ? opts.config : ScoutConfiguration.build();
                req.app.scout = new Scout(config);
                return req.app.scout.setup();
            };
        }

        // Get the scout instance
        getScout()
            .then(scout => {
                // Create a trace
                scout
                    .startRequest()
                    .then((scoutRequest: ScoutRequest) => {
                        // Save the scout request onto the request object
                        req.scout = {request: req};

                        // Set up the request timeout
                        let timeoutMs = Constants.DEFAULT_EXPRESS_REQUEST_TIMEOUT_MS;
                        if (opts && opts.requestTimeoutMs) { timeoutMs = opts.requestTimeoutMs; }
                        setTimeout(() => scoutRequest.finish(), timeoutMs);

                        // Set up handler to act on end of request
                        onFinished(res, (err, res) => {
                            scoutRequest.finish();
                        });

                        next();
                    })
                    .catch((err: Error) => {
                        if (opts && opts.logFn) {
                            opts.logFn(`[scout] Error setting up tracing for request:\n ${err}`, LogLevel.Error);
                        }
                        next();
                    });
            })
        // Continue even if getting scout fails
            .catch((err: Error) => {
                if (opts && opts.logFn) {
                    opts.logFn(`[scout] No scout instance on Express application:\n ${err}`, LogLevel.Error);
                }
                next();
            });
    };
}
