"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const onFinished = require("on-finished");
const types_1 = require("./types");
const Constants = require("./constants");
const scout_1 = require("./scout");
/**
 * Middleware for using scout, this should be
 * attached to the application object using app.use(...)
 *
 * @param {ScoutConfiguration} config - Express Request
 * @param {Function} logFn - Express Response
 * @returns {Function} a middleware function for use with express
 */
function scoutMiddleware(opts) {
    // A cache for frequently hit middlewares (which are often routes like  sorts for
    const commonRouteMiddlewares = [];
    return (req, res, next) => {
        // Exit early if we cannot access the application from the request
        if (!req || !req.app) {
            if (opts && opts.logFn) {
                opts.logFn(`[scout] Request object is missing/invalid (application object missing)`, types_1.LogLevel.Warn);
            }
            next();
            return;
        }
        let getScout = () => Promise.resolve(req.app.scout);
        // Create the scout agent if not present on the app
        if (!req.app.scout) {
            getScout = () => {
                // Use custom scout configuration if provided
                const config = types_1.buildScoutConfiguration(opts && opts.config ? opts.config : {});
                req.app.scout = new scout_1.Scout(config);
                return req.app.scout.setup();
            };
        }
        // Set default request timeout if not specified
        let requestTimeoutMs = Constants.DEFAULT_EXPRESS_REQUEST_TIMEOUT_MS;
        if (opts && "requestTimeoutMs" in opts) {
            requestTimeoutMs = opts.requestTimeoutMs;
        }
        // Get the scout instance
        getScout()
            .then(scout => {
            // Create a trace
            scout
                .startRequest()
                .then((scoutRequest) => {
                // Save the scout request onto the request object
                req.scout = Object.assign(req.scout || {}, { request: req });
                // Set up the request timeout
                if (requestTimeoutMs > 0) {
                    setTimeout(() => {
                        // Tag the request as timed out
                        scoutRequest
                            .addTags([{ name: "timeout", value: "true" }])
                            .then(() => scoutRequest.finishAndSend())
                            .catch(() => {
                            if (opts && opts.logFn) {
                                opts.logFn(`[scout] Failed to finish request that timed out: ${scoutRequest}`, types_1.LogLevel.Warn);
                            }
                        });
                    }, requestTimeoutMs);
                }
                // Set up handler to act on end of request
                onFinished(res, (err, res) => {
                    // Finish & send request
                    scoutRequest.finishAndSend();
                });
                // Attempt to match one of the common middlewares first
                const reqUrl = req.url.toString();
                let matchedRouteMiddleware = commonRouteMiddlewares.find((m) => m.regexp.test(reqUrl));
                // If we couldn't find a route in the ones that have worked before,
                // then we have to search the router stack
                if (!matchedRouteMiddleware) {
                    // Find routes that match the current URL
                    matchedRouteMiddleware = req.app._router.stack
                        .filter((middleware) => {
                        // We can recognize a middleware as a route if .route & .regexp are present
                        if (!middleware || !middleware.route || !middleware.regexp) {
                            return false;
                        }
                        // Check if the URL matches the route
                        const isMatch = middleware.regexp.test(reqUrl);
                        // Add matches in the hope that common routes will be faster than searching everything
                        if (isMatch) {
                            commonRouteMiddlewares.push(middleware);
                        }
                        return isMatch;
                    })[0];
                }
                // Create a Controller/ span for the request
                const path = matchedRouteMiddleware.route.path || reqUrl;
                const reqMethod = req.method.toUpperCase();
                // Start a span for the request
                scoutRequest
                    .startChildSpan(`Controller/${reqMethod} ${path}`)
                    .then(rootSpan => {
                    // Add the span to the request object
                    Object.assign(req.scout, { rootSpan });
                    next();
                })
                    .catch(() => next());
            })
                .catch((err) => {
                if (opts && opts.logFn) {
                    opts.logFn(`[scout] Error setting up tracing for request:\n ${err}`, types_1.LogLevel.Error);
                }
                next();
            });
        })
            // Continue even if getting scout fails
            .catch((err) => {
            if (opts && opts.logFn) {
                opts.logFn(`[scout] No scout instance on Express application:\n ${err}`, types_1.LogLevel.Error);
            }
            next();
        });
    };
}
exports.scoutMiddleware = scoutMiddleware;
