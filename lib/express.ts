import * as onFinished from "on-finished";
import { LogLevel, ScoutConfiguration, buildScoutConfiguration, LogFn, consoleLogFn } from "./types";
import * as Constants from "./constants";
import { Scout, ScoutRequest, ScoutOptions } from "./scout";

export interface ApplicationWithScout {
    scout?: Scout;
}

type ExpressMiddleware = (req: any, res: any, next: () => void) => void;

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
export function scoutMiddleware(opts?: ExpressMiddlewareOptions): ExpressMiddleware {
    // A cache for frequently hit middlewares (which are often routes like  sorts for
    const commonRouteMiddlewares: any[] = [];

    return (req: any, res: any, next: () => void) => {
        // Exit early if we cannot access the application from the request
        if (!req || !req.app) {
            if (opts && opts.logFn) {
                opts.logFn(`[scout] Request object is missing/invalid (application object missing)`, LogLevel.Warn);
            }
            next();
            return;
        }

        // Attempt to match the request URL to previous matched middleware first
        const reqUrl = req.url.toString();
        let matchedRouteMiddleware = commonRouteMiddlewares.find((m: any) => m.regexp.test(reqUrl));

        // If we couldn't find a route in the ones that have worked before,
        // then we have to search the router stack
        if (!matchedRouteMiddleware) {
            // Find routes that match the current URL
            matchedRouteMiddleware = req.app._router.stack
                .filter((middleware: any) => {
                    // We can recognize a middleware as a route if .route & .regexp are present
                    if (!middleware || !middleware.route || !middleware.regexp) { return false; }

                    // Check if the URL matches the route
                    const isMatch = middleware.regexp.test(reqUrl);

                    // Add matches in the hope that common routes will be faster than searching everything
                    if (isMatch) { commonRouteMiddlewares.push(middleware); }

                    return isMatch;
                })[0];
        }

        // Create a Controller/ span for the request
        const path = matchedRouteMiddleware.route.path || reqUrl;
        const reqMethod = req.method.toUpperCase();

        let getScout: () => Promise<Scout> = () => Promise.resolve(req.app.scout);

        // Create the scout agent if not present on the app
        if (!req.app.scout) {
            getScout = () => {
                // If a scout instance to use was given then let's use that
                if (opts && opts.scout) { return Promise.resolve(opts.scout); }

                // Use custom scout configuration if provided
                const overrides = opts && opts.config ? opts.config : {};
                const config: Partial<ScoutConfiguration> = buildScoutConfiguration(overrides);
                const options: ScoutOptions = {
                    logFn: opts && opts.logFn ? opts.logFn : undefined,
                };

                req.app.scout = new Scout(config, options);
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
                // Exit early if this path is on the list of ignored paths
                if (scout.ignoresPath(path)) {
                    next();
                    return;
                }

                // Create a trace
                scout
                    .startRequest()
                // Tag the request with the pageh
                    .then(req => req.addTags([
                        { name: Constants.SCOUT_PATH_TAG, value: scout.filterURL(reqUrl).toString() },
                    ]))
                // Perform the rest of the request tracing
                    .then((scoutRequest: ScoutRequest) => {
                        // Save the scout request onto the request object
                        req.scout = Object.assign(req.scout || {}, {request: req});

                        // Set up the request timeout
                        if (requestTimeoutMs > 0) {
                            setTimeout(() => {
                                // Add context to indicate request as timed out
                                scoutRequest
                                    .addContext([{name: "timeout", value: "true"}])
                                    .then(() => scoutRequest.finishAndSend())
                                    .catch(() => {
                                        if (opts && opts.logFn) {
                                            opts.logFn(
                                                `[scout] Failed to finish request that timed out: ${scoutRequest}`,
                                                LogLevel.Warn,
                                            );
                                        }
                                    });
                            }, requestTimeoutMs);
                        }

                        // Set up handler to act on end of request
                        onFinished(res, (err, res) => {
                            // Finish & send request
                            scoutRequest.finishAndSend();
                        });

                        // Start a span for the request
                        scoutRequest
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
