"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const onFinished = require("on-finished");
const types_1 = require("./types");
const Constants = require("./constants");
const global_1 = require("./global");
const path_to_regexp_1 = require("path-to-regexp");
const listExpressEndpoints = require("express-list-endpoints");
const getNanoTime = require("nano-time");
const BigNumber = require("big-number");
// Support common request queue time headers
// https://github.com/scoutapp/scout_apm_node/issues/68
const REQUEST_QUEUE_TIME_HEADERS = ["x-queue-start", "x-request-start"];
/**
 * Parse a queue time in NS out of a HTTP header value
 *
 * @param {string} value - value of the header
 * @return {BigNumber}
 */
function parseQueueTimeNS(value) {
    if (!value) {
        return null;
    }
    value = value.trim();
    if (!value.startsWith("t=")) {
        return null;
    }
    const parsed = new BigNumber(value.slice(2));
    if (parsed.number === "Invalid Number") {
        return null;
    }
    return parsed;
}
let CACHED_ENDPOINT_LISTING = [];
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
    // Build configuration overrides
    const overrides = opts && opts.config ? opts.config : {};
    const config = types_1.buildScoutConfiguration(overrides);
    const options = {
        logFn: opts && opts.logFn ? opts.logFn : undefined,
    };
    // Set the last used configurations
    global_1.setGlobalLastUsedConfiguration(config);
    global_1.setGlobalLastUsedOptions(options);
    return (req, res, next) => {
        const requestStartTimeNS = getNanoTime();
        // If there is no global scout instance yet and no scout instance just go to next middleware immediately
        const scout = opts && opts.scout ? opts.scout : req.app.scout || global_1.getActiveGlobalScoutInstance();
        // Build a closure that installs scout (and waits on it)
        // depending on whether waitForScoutSetup is set we will run this in the background or inline
        const setupScout = () => {
            // If app doesn't already have a scout instance *and* no active global one is present, create one
            return global_1.getOrCreateActiveGlobalScoutInstance(config, options)
                .then(scout => req.app.scout = scout);
        };
        const waitForScoutSetup = opts && opts.waitForScoutSetup;
        // If we're not waiting for scout to set up, then set it up in the background
        if (!scout && !waitForScoutSetup) {
            // Get or create the active global scout instance, in the background
            setImmediate(setupScout);
            next();
            return;
        }
        // Exit early if we cannot access the application from the request
        if (!req || !req.app) {
            if (opts && opts.logFn) {
                opts.logFn(`[scout] Request object is missing/invalid (application object missing)`, types_1.LogLevel.Warn);
            }
            next();
            return;
        }
        // We don't know the route path (ex. '/echo/:name'), but we must figure it out
        let routePath = null;
        // Attempt to match the request URL (ex. '/echo/john') to previous matched middleware first
        const reqUrl = req.url;
        // The query of the URL needs to be  stripped before attempting to test it against express regexps
        // i.e. all route regexps end in /..\?$/
        const preQueryUrl = reqUrl.split("?")[0];
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
        // If by this point we know a matching route middleware we can use it's path
        // (for the request name, e.x. "Controller/GET <some path>")
        if (matchedRouteMiddleware) {
            routePath = matchedRouteMiddleware.route.path;
        }
        // If we get to this point and matchedRouteMiddleware is still empty/missing
        // we're likely in the case of a nested express.Router and cannot rely on
        // app.mountpath, req.baseUrl, req.originalUrl, or anything else to get the correct path
        // We're stuck with the worst possible way -- listing all the routes, and there's only
        // one lib that does it right (without re-implementing the walk ourselves), and we still have to
        // perform the regex matches to find out which path is actually *active*
        if (!matchedRouteMiddleware) {
            try {
                // Generate the endpoint listing cache if it's empty, once
                if (CACHED_ENDPOINT_LISTING.length === 0) {
                    CACHED_ENDPOINT_LISTING = listExpressEndpoints(req.app)
                        // Enrich endpoint list with regexes for the full match
                        .map(r => {
                        r.regex = path_to_regexp_1.pathToRegexp(r.path);
                        return r;
                    });
                }
                const matchedRoute = CACHED_ENDPOINT_LISTING.find(r => r.regex.exec(req.originalUrl));
                if (!matchedRoute) {
                    throw new Error("Failed to match route");
                }
                // If we were able to find a matching route the hard way, we can use it
                routePath = matchedRoute.path;
            }
            catch (err) {
                if (opts && opts.logFn) {
                    opts.logFn(`[scout] Failed to determine route of request, [${req.originalUrl}]`, types_1.LogLevel.Warn);
                }
            }
        }
        // Set default request timeout if not specified
        let requestTimeoutMs = Constants.DEFAULT_EXPRESS_REQUEST_TIMEOUT_MS;
        if (opts && "requestTimeoutMs" in opts) {
            requestTimeoutMs = opts.requestTimeoutMs;
        }
        // Use scout instance already set on the application if present
        Promise.resolve(scout)
            .then(scout => {
            if (!scout && waitForScoutSetup) {
                return setupScout();
            }
            return scout;
        })
            // Set the scout instance on the application
            .then(scout => req.app.scout = scout)
            // Set up the scout instance (if necessary)
            .then(scout => scout.setup())
            // Start perofrming midleware duties
            .then(scout => {
            // If we get here but have no route path,
            // (meaning we couldn't figure it out from a matched middleware or full route listing)
            // then we can't record the request
            if (!routePath) {
                scout.emit(types_1.ScoutEvent.UnknownRequestPathSkipped, req.url);
                next();
                return;
            }
            // Create a Controller/ span for the request
            const reqMethod = req.method.toUpperCase();
            // Exit early if this path is on the list of ignored paths
            if (scout.ignoresPath(routePath)) {
                next();
                return;
            }
            req.scout = { instance: scout };
            const name = `Controller/${reqMethod} ${routePath}`;
            let transactionTimeout;
            // Create a trace
            scout.transaction(name, (finishTransaction) => {
                req.scout.request = scout.getCurrentRequest();
                if (!req.scout.request) {
                    if (opts && opts.logFn) {
                        opts.logFn(`[scout] Failed to start transaction, no current request`, types_1.LogLevel.Warn);
                    }
                    next();
                    return;
                }
                // Add the path context
                req.scout.request
                    .addContext(types_1.ScoutContextName.Path, scout.filterRequestPath(reqUrl))
                    // Add request queue time context if present
                    .then(() => {
                    const matchingHeader = REQUEST_QUEUE_TIME_HEADERS.find(headerName => req.get(headerName));
                    // If a header was found, extract the queue time
                    if (matchingHeader) {
                        const value = parseQueueTimeNS(req.get(matchingHeader));
                        return req.scout.request.addContext(types_1.ScoutContextName.QueueTimeNS, new BigNumber(requestStartTimeNS).minus(value).toString());
                    }
                })
                    // Perform the rest of the request tracing
                    .then(() => {
                    // Start a span for the Controller
                    scout.instrument(name, finishSpan => {
                        // Set up the request timeout
                        if (requestTimeoutMs > 0) {
                            transactionTimeout = setTimeout(() => {
                                // Add context to indicate request as timed out
                                req.scout.request
                                    .addContext(types_1.ScoutContextName.Timeout, "true")
                                    .then(() => finishTransaction())
                                    .catch(() => {
                                    if (opts && opts.logFn) {
                                        opts.logFn(`[scout] Failed to finish (timed out): ${req.scout.request}`, types_1.LogLevel.Warn);
                                    }
                                });
                            }, requestTimeoutMs);
                        }
                        // Set up handler to act on end of request
                        onFinished(res, (err, res) => {
                            // If the request finished, clear the timeout-marker
                            if (transactionTimeout) {
                                clearTimeout(transactionTimeout);
                            }
                            // Finish transaction (which *must* trigger a send)
                            finishTransaction()
                                .then(() => delete req.scout);
                        });
                        const rootSpan = scout.getCurrentSpan();
                        // Add the span to the request object
                        req.scout.rootSpan = rootSpan;
                        // Setup of the transaction and instrumentation succeeded
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
