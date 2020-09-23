import * as onFinished from "on-finished";
import {
    LogFn,
    LogLevel,
    ScoutConfiguration,
    ScoutContextName,
    ScoutEvent,
    ScoutTag,
    buildScoutConfiguration,
    consoleLogFn,
} from "./types";
import * as Constants from "./constants";
import { Scout, ScoutRequest, ScoutSpan, ScoutOptions } from "./scout";
import {
    getActiveGlobalScoutInstance,
    getOrCreateActiveGlobalScoutInstance,
    setGlobalLastUsedConfiguration,
    setGlobalLastUsedOptions,
} from "./global";

export interface ApplicationWithScout {
    scout?: Scout;
}

type ExpressMiddleware = (req: any, res: any, next: () => void) => void;

export interface ExpressMiddlewareOptions {
    config?: Partial<ScoutConfiguration>;
    requestTimeoutMs?: number;
    logFn?: LogFn;
    scout?: Scout;

    // Whether to wait (normally during the first request) for scout to setup
    waitForScoutSetup?: boolean;
}

// The information that is
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
export function scoutMiddleware(opts?: ExpressMiddlewareOptions): ExpressMiddleware {
    // A cache for frequently hit middlewares (which are often routes like  sorts for
    const commonRouteMiddlewares: any[] = [];

    // Build configuration overrides
    const overrides = opts && opts.config ? opts.config : {};
    const config: Partial<ScoutConfiguration> = buildScoutConfiguration(overrides);
    const options: ScoutOptions = {
        logFn: opts && opts.logFn ? opts.logFn : undefined,
    };

    // Set the last used configurations
    setGlobalLastUsedConfiguration(config);
    setGlobalLastUsedOptions(options);

    return (req: any, res: any, next: () => void) => {
        // If there is no global scout instance yet and no scout instance just go to next middleware immediately
        const scout = opts && opts.scout ? opts.scout : req.app.scout || getActiveGlobalScoutInstance();

        // Build a closure that installs scout (and waits on it)
        // depending on whether waitForScoutSetup is set we will run this in the background or inline
        const setupScout = () => {
            // If app doesn't already have a scout instance *and* no active global one is present, create one
            return getOrCreateActiveGlobalScoutInstance(config, options)
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
                opts.logFn(`[scout] Request object is missing/invalid (application object missing)`, LogLevel.Warn);
            }
            next();
            return;
        }

        // Attempt to match the request URL to previous matched middleware first
        const reqPath = req.url;
        // The query of the URL needs to be  stripped before attempting to test it against express regexps
        // i.e. all route regexps end in /..\?$/
        const preQueryUrl = reqPath.split("?")[0];
        let matchedRouteMiddleware = commonRouteMiddlewares.find((m: any) => m.regexp.test(preQueryUrl));

        // If we couldn't find a route in the ones that have worked before,
        // then we have to search the router stack
        if (!matchedRouteMiddleware) {
            // Find routes that match the current URL
            matchedRouteMiddleware = req.app._router.stack
                .filter((middleware: any) => {
                    // We can recognize a middleware as a route if .route & .regexp are present
                    if (!middleware || !middleware.route || !middleware.regexp) { return false; }

                    // Check if the URL matches the route
                    const isMatch = middleware.regexp.test(preQueryUrl);

                    // Add matches in the hope that common routes will be faster than searching everything
                    if (isMatch) { commonRouteMiddlewares.push(middleware); }

                    return isMatch;
                })[0];
        }

        // Set default request timeout if not specified
        let requestTimeoutMs = Constants.DEFAULT_EXPRESS_REQUEST_TIMEOUT_MS;
        if (opts && "requestTimeoutMs" in opts) {
            requestTimeoutMs = opts.requestTimeoutMs!;
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
                // If no route matches then we don't need to record
                if (!matchedRouteMiddleware) {
                    scout.emit(ScoutEvent.UnknownRequestPathSkipped, req.url);
                    next();
                    return;
                }

                // Create a Controller/ span for the request
                const path = matchedRouteMiddleware.route.path;
                const reqMethod = req.method.toUpperCase();

                // Exit early if this path is on the list of ignored paths
                if (scout.ignoresPath(path)) {
                    next();
                    return;
                }

                req.scout = {instance: scout} as ExpressRequestWithScout;

                const name = `Controller/${reqMethod} ${path}`;
                // Create a trace
                scout.transaction(name, (finishTransaction) => {
                    req.scout.request = scout.getCurrentRequest();
                    if (!req.scout.request) {
                        if (opts && opts.logFn) {
                            opts.logFn(`[scout] Failed to start transaction, no current request`, LogLevel.Warn);
                        }
                        next();
                        return;
                    }

                    // Add the path context
                    req.scout.request.addContext(ScoutContextName.Path, scout.filterRequestPath(reqPath))
                    // Perform the rest of the request tracing
                        .then(() => {
                            // Start a span for the Controller
                            scout.instrument(name, finishSpan => {

                                // Set up the request timeout
                                if (requestTimeoutMs > 0) {
                                    setTimeout(() => {
                                        // Add context to indicate request as timed out
                                        req.scout.request
                                            .addContext(ScoutContextName.Timeout, "true")
                                            .then(() => finishTransaction())
                                            .catch(() => {
                                                if (opts && opts.logFn) {
                                                    opts.logFn(
                                                        `[scout] Failed to finish (timed out): ${req.scout.request}`,
                                                        LogLevel.Warn,
                                                    );
                                                }
                                            });
                                    }, requestTimeoutMs);
                                }

                                // Set up handler to act on end of request
                                onFinished(res, (err, res) => {
                                    // Finish transaction (which will trigger a send)
                                    finishSpan();
                                    finishTransaction();
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
            .catch((err: Error) => {
                if (opts && opts.logFn) {
                    opts.logFn(`[scout] No scout instance on Express application:\n ${err}`, LogLevel.Error);
                }

                next();
            });
    };
}
