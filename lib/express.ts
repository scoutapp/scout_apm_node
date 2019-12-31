import * as onFinished from "on-finished";
import { LogLevel, ScoutConfiguration, buildScoutConfiguration, LogFn, consoleLogFn } from "./types";
import * as Constants from "./constants";
import { Scout, ScoutRequest } from "./scout";

export interface ApplicationWithScout {
    scout?: Scout;
}

type ExpressMiddleware = (req: any, res: any, next: () => void) => void;

export interface ExpressMiddlewareOptions {
    config?: Partial<ScoutConfiguration>;
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
                const config = opts && opts.config ? opts.config : buildScoutConfiguration();
                req.app.scout = new Scout(config);
                return req.app.scout.setup();
            };
        }

        // Set default request timeout if not specified
        let requestTimeoutMs = Constants.DEFAULT_EXPRESS_REQUEST_TIMEOUT_MS;
        if (opts && "requestTimeoutMs" in opts) {
            requestTimeoutMs = opts.requestTimeoutMs!;
        }

        // Get the scout instance
        getScout()
            .then(scout => {
                // Create a trace
                return scout
                    .startRequest()
                    .then((scoutRequest: ScoutRequest) => {
                        // Save the scout request onto the request object
                        req.scout = Object.assign(req.scout || {}, {request: req});

                        // Set up the request timeout
                        if (requestTimeoutMs > 0) {
                            setTimeout(() => {
                                // Do not perform timeout code if request is already stopped
                                if (scoutRequest.isStopped()) {
                                    return;
                                }

                                // Tag the request as timed out
                                scoutRequest
                                    .addTags([{name: "timeout", value: "true"}])
                                    .then(() => scoutRequest.finish())
                                    .catch(() => scoutRequest.finish());
                            }, requestTimeoutMs);
                        }

                        // Set up handler to act on end of request
                        onFinished(res, (err, res) => {
                            scoutRequest.finish();
                        });

                        // Find routes that match the current URL
                        const matchedRoutes = req.app._router.stack
                            .filter((middleware: any) => {
                                return middleware.route
                                    && middleware.regexp
                                    && middleware.regexp.test(req.url.toString());
                            });

                        // Create a Controller/ span for the request
                        const path = matchedRoutes.length > 0 ? matchedRoutes[0].route.path : "Unknown";
                        const reqMethod = req.method.toUpperCase();

                        // Start a span for the request
                        return scoutRequest
                            .startChildSpan(`Controller/${reqMethod} ${path}`)
                            .then(rootSpan => {
                                // Add the span to the request object
                                Object.assign(req.scout, {rootSpan});
                                next();
                            })
                            .catch(() => next());
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
