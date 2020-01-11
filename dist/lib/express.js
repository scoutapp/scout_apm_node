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
        // Attempt to match the request URL to previous matched middleware first
        const reqPath = req.url;
        // The query of the URL needs to be  stripped before attempting to test it against express regexps
        // i.e. all route regexps end in /..\?$/
        const preQueryUrl = reqPath.split("?")[0];
        let matchedRouteMiddleware = commonRouteMiddlewares.find((m) => m.regexp.test(preQueryUrl));
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
                const isMatch = middleware.regexp.test(preQueryUrl);
                // Add matches in the hope that common routes will be faster than searching everything
                if (isMatch) {
                    commonRouteMiddlewares.push(middleware);
                }
                return isMatch;
            })[0];
        }
        // Create a Controller/ span for the request
        const path = matchedRouteMiddleware ? matchedRouteMiddleware.route.path : reqPath;
        const reqMethod = req.method.toUpperCase();
        let getScout = () => Promise.resolve(req.app.scout);
        // Create the scout agent if not present on the app
        if (!req.app.scout) {
            getScout = () => {
                // If a scout instance to use was given then let's use that
                if (opts && opts.scout) {
                    return opts.scout.setup();
                }
                // Use custom scout configuration if provided
                const overrides = opts && opts.config ? opts.config : {};
                const config = types_1.buildScoutConfiguration(overrides);
                const options = {
                    logFn: opts && opts.logFn ? opts.logFn : undefined,
                };
                req.app.scout = new scout_1.Scout(config, options);
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
            // Exit early if this path is on the list of ignored paths
            if (scout.ignoresPath(path)) {
                next();
                return;
            }
            const name = `Controller/${reqMethod} ${path}`;
            // Create a trace
            scout.transaction(name, () => {
                const scoutReq = scout.getCurrentRequest();
                if (!scoutReq) {
                    if (opts && opts.logFn) {
                        opts.logFn(`[scout] Failed to start transaction, no current request`, types_1.LogLevel.Warn);
                    }
                    next();
                    return;
                }
                const pathTag = {
                    name: Constants.SCOUT_PATH_TAG,
                    value: scout.filterRequestPath(reqPath),
                };
                // Add the path context
                scoutReq.addContext([pathTag])
                    // Perform the rest of the request tracing
                    .then(() => {
                    // Save the scout request onto the request object
                    req.scout = Object.assign(req.scout || {}, { request: req });
                    // Set up the request timeout
                    if (requestTimeoutMs > 0) {
                        setTimeout(() => {
                            // Add context to indicate request as timed out
                            scoutReq
                                .addContext([{ name: "timeout", value: "true" }])
                                .then(() => scoutReq.finishAndSend())
                                .catch(() => {
                                if (opts && opts.logFn) {
                                    opts.logFn(`[scout] Failed to finish request that timed out: ${scoutReq}`, types_1.LogLevel.Warn);
                                }
                            });
                        }, requestTimeoutMs);
                    }
                    // Set up handler to act on end of request
                    onFinished(res, (err, res) => {
                        // Finish & send request
                        scoutReq.finishAndSend();
                    });
                    // Start a span for the request
                    scout.instrument(name, () => {
                        const rootSpan = scout.getCurrentSpan();
                        // Add the span to the request object
                        Object.assign(req.scout, { rootSpan });
                        next();
                    });
                });
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
