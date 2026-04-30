"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoutMiddleware = scoutMiddleware;
const on_finished_1 = __importDefault(require("on-finished"));
const types_1 = require("./types");
const Constants = __importStar(require("./constants"));
const global_1 = require("./global");
const path_to_regexp_1 = require("path-to-regexp");
const listExpressEndpointsLib = require("express-list-endpoints");
const getNanoTime = require("nano-time");
const BigNumber = require("big-number");
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
function listExpressEndpoints(app) {
    // Try express-list-endpoints first (works for Express 4)
    const libResult = listExpressEndpointsLib(app);
    if (libResult && libResult.length > 0) {
        return libResult;
    }
    // Express 5: walk the router stack ourselves
    const endpoints = [];
    // Express 4 uses app._router; Express 5 uses app.router (a getter that throws on Express 4)
    let router = app._router;
    if (!router) {
        try {
            router = app.router;
        }
        catch { /* Express 4 getter throws */ }
    }
    if (!router || !router.stack) {
        return endpoints;
    }
    function walkStack(stack, basePath = "") {
        for (const layer of stack) {
            // Direct route on the app/router
            if (layer.route) {
                const methods = Object.keys(layer.route.methods)
                    .filter((m) => layer.route.methods[m])
                    .map((m) => m.toUpperCase());
                endpoints.push({
                    path: basePath + layer.route.path,
                    methods,
                    middleware: [],
                });
            }
            // Nested router (app.use('/prefix', router))
            else if (layer.name === "router" && layer.handle && layer.handle.stack) {
                let prefix = "";
                // Express 5: check layer.path directly
                if (layer.path) {
                    prefix = layer.path;
                }
                // Express 5: extract prefix from matcher by testing common path patterns
                else if (layer.matchers && layer.matchers.length > 0) {
                    // The matcher function returns { path: '/matched/prefix', params: {} } or false
                    const probeResults = [
                        layer.matchers[0]("/"),
                        layer.matchers[0]("/api"),
                        layer.matchers[0]("/v1"),
                        layer.matchers[0]("/v2"),
                        layer.matchers[0]("/admin"),
                        layer.matchers[0]("/auth"),
                    ].filter((r) => r !== false);
                    if (probeResults.length > 0) {
                        prefix = probeResults[0].path;
                    }
                }
                // Express 4: layer.regexp
                else if (layer.regexp) {
                    const match = layer.regexp.source.match(/^\^\\\/([^\\\/\?\*\+\[\]]+)/);
                    if (match) {
                        prefix = "/" + match[1];
                    }
                }
                walkStack(layer.handle.stack, basePath + prefix);
            }
        }
    }
    walkStack(router.stack);
    return endpoints;
}
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
const ROUTE_INFO_LOOKUP = {};
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
    const config = (0, types_1.buildScoutConfiguration)(overrides);
    const options = {
        logFn: opts && opts.logFn ? opts.logFn : undefined,
        statisticsIntervalMS: opts && opts.statisticsIntervalMS ? opts.statisticsIntervalMS : undefined,
    };
    // Set the last used configurations
    (0, global_1.setGlobalLastUsedConfiguration)(config);
    (0, global_1.setGlobalLastUsedOptions)(options);
    return (req, res, next) => {
        const requestStartTimeNS = getNanoTime();
        // If there is no global scout instance yet and no scout instance just go to next middleware immediately
        const scout = opts && opts.scout ? opts.scout : req.app.scout || (0, global_1.getActiveGlobalScoutInstance)();
        // Build a closure that installs scout (and waits on it)
        // depending on whether waitForScoutSetup is set we will run this in the background or inline
        const setupScout = () => {
            // If app doesn't already have a scout instance *and* no active global one is present, create one
            return (0, global_1.getOrCreateActiveGlobalScoutInstance)(config, options)
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
        // Attempt to match the request URL (ex. '/echo/john') to previous matched middleware first
        const reqUrl = req.url;
        // We don't know the route path (ex. '/echo/:name'), but we must figure it out
        let routePath = reqUrl === "/" ? "/" : null;
        // The query of the URL needs to be  stripped before attempting to test it against express regexps
        // i.e. all route regexps end in /..\?$/
        const preQueryUrl = reqUrl.split("?")[0];
        // Helper to check if a middleware matches the URL
        // Express 4 uses .regexp, Express 5 uses .matchers array of functions
        const middlewareMatchesUrl = (m, url) => {
            if (!m) {
                return false;
            }
            // Express 4: use regexp.test()
            if (m.regexp && typeof m.regexp.test === "function") {
                return m.regexp.test(url);
            }
            // Express 5: use matchers[0]() which returns false or { path, params }
            if (m.matchers && m.matchers.length > 0 && typeof m.matchers[0] === "function") {
                return m.matchers[0](url) !== false;
            }
            return false;
        };
        let matchedRouteMiddleware = commonRouteMiddlewares.find((m) => middlewareMatchesUrl(m, preQueryUrl));
        // If we couldn't find a route in the ones that have worked before,
        // then we have to search the router stack
        // Express 4 uses _router; Express 5 uses router (a getter that throws on Express 4)
        let appRouter = req.app._router;
        if (!appRouter) {
            try {
                appRouter = req.app.router;
            }
            catch { /* Express 4 getter throws */ }
        }
        if (!routePath && appRouter && appRouter.stack) {
            // Find routes that match the current URL
            matchedRouteMiddleware = appRouter.stack
                .filter((middleware) => {
                // We can recognize a middleware as a route if .route is present
                // Express 4 also requires .regexp, Express 5 uses .matchers instead
                if (!middleware || !middleware.route) {
                    return false;
                }
                const hasRouteMatcher = middleware.regexp || (middleware.matchers && middleware.matchers.length > 0);
                if (!hasRouteMatcher) {
                    return false;
                }
                // Check if the URL matches the route
                const isMatch = middlewareMatchesUrl(middleware, preQueryUrl);
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
        if (!routePath) {
            try {
                // Attempt to find a matchedRoute in the cached endpoint listing
                let matchedRoute = Object.values(ROUTE_INFO_LOOKUP).find(r => r.regex.exec(req.originalUrl));
                // If we fail to find a matched route, we can try generating the listing anew,
                // and insert what we find if any new routes are present and try again
                if (!matchedRoute) {
                    listExpressEndpoints(req.app)
                        .forEach(r => {
                        // Enrich endpoint list with regexes for the full match
                        r.regex = (0, path_to_regexp_1.pathToRegexp)(r.path);
                        ROUTE_INFO_LOOKUP[r.path] = r;
                    });
                    // Search again after adding to the cache
                    matchedRoute = Object.values(ROUTE_INFO_LOOKUP).find(r => r.regex.exec(req.originalUrl));
                }
                // If we *still* can't find a matched route then we have to give up on this method
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
                        (0, on_finished_1.default)(res, (err, res) => {
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
