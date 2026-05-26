import onFinished from "on-finished";
import { AsyncResource } from "async_hooks";
import {
    LogFn,
    LogLevel,
    ScoutConfiguration,
    ScoutContextName,
    ScoutEvent,
    buildScoutConfiguration,
} from "./types";
import * as Constants from "./constants";
import { Scout, ScoutRequest, ScoutSpan, ScoutOptions } from "./scout";
import {
    getActiveGlobalScoutInstance,
    getOrCreateActiveGlobalScoutInstance,
    setGlobalLastUsedConfiguration,
    setGlobalLastUsedOptions,
} from "./global";
import { listExpressEndpoints, EndpointInfo, ApplicationWithScout, ExpressScoutInfo } from "./express";
import { pathToRegexp } from "path-to-regexp";

const getNanoTime = require("nano-time");
const BigNumber = require("big-number");

export type NestMiddlewareOptions = {
    config?: Partial<ScoutConfiguration>;
    logFn?: LogFn;
    requestTimeoutMs?: number;
    statisticsIntervalMS?: number;
    scout?: Scout;
    waitForScoutSetup?: boolean;
};

// NestJS-specific route cache — separate from the Express middleware's cache so
// the two don't interfere when both are used in the same process.
const NEST_ROUTE_INFO_LOOKUP: { [key: string]: EndpointInfo & { regex: RegExp } } = {};

const REQUEST_QUEUE_TIME_HEADERS = ["x-queue-start", "x-request-start"];

function parseQueueTimeNS(value: string): any {
    if (!value) { return null; }
    value = value.trim();
    if (!value.startsWith("t=")) { return null; }
    const parsed = new BigNumber(value.slice(2));
    if (parsed.number === "Invalid Number") { return null; }
    return parsed;
}

type NestMiddleware = (req: any, res: any, next: () => void) => void;

export function nestMiddleware(opts?: NestMiddlewareOptions): NestMiddleware {
    const overrides = opts && opts.config ? opts.config : {};
    const config: Partial<ScoutConfiguration> = buildScoutConfiguration(overrides);
    const options: ScoutOptions = {
        logFn: opts && opts.logFn ? opts.logFn : undefined,
        statisticsIntervalMS: opts && opts.statisticsIntervalMS ? opts.statisticsIntervalMS : undefined,
    };

    setGlobalLastUsedConfiguration(config);
    setGlobalLastUsedOptions(options);

    return (req: any, res: any, next: () => void) => {
        const requestStartTimeNS = getNanoTime();

        const scout = opts && opts.scout ? opts.scout : req.app.scout || getActiveGlobalScoutInstance();

        const setupScout = () =>
            getOrCreateActiveGlobalScoutInstance(config, options)
                .then(s => req.app.scout = s);

        const waitForScoutSetup = opts && opts.waitForScoutSetup;

        if (!scout && !waitForScoutSetup) {
            setImmediate(setupScout);
            next();
            return;
        }

        if (!req || !req.app) {
            if (opts && opts.logFn) {
                opts.logFn(`[scout] Request object is missing/invalid (application object missing)`, LogLevel.Warn);
            }
            next();
            return;
        }

        const reqUrl = req.url;
        const preQueryUrl = reqUrl.split("?")[0];

        // NestJS routes are always registered on a nested Express Router, never as
        // top-level layers on app._router.  Skip the flat stack scan and go straight
        // to listExpressEndpoints which walks the full nested tree.
        let routePath: string | null = reqUrl === "/" ? "/" : null;

        if (!routePath) {
            try {
                let matchedRoute = Object.values(NEST_ROUTE_INFO_LOOKUP).find(r => r.regex.exec(preQueryUrl));

                if (!matchedRoute) {
                    listExpressEndpoints(req.app).forEach(r => {
                        NEST_ROUTE_INFO_LOOKUP[r.path] = {
                            ...r,
                            regex: pathToRegexp(r.path),
                        };
                    });
                    matchedRoute = Object.values(NEST_ROUTE_INFO_LOOKUP).find(r => r.regex.exec(preQueryUrl));
                }

                if (matchedRoute) {
                    routePath = matchedRoute.path;
                }
            } catch (err) {
                if (opts && opts.logFn) {
                    opts.logFn(`[scout] Failed to determine route of request, [${req.originalUrl}]`, LogLevel.Warn);
                }
            }
        }

        let requestTimeoutMs = Constants.DEFAULT_EXPRESS_REQUEST_TIMEOUT_MS;
        if (opts && "requestTimeoutMs" in opts) {
            requestTimeoutMs = opts.requestTimeoutMs!;
        }

        Promise.resolve(scout)
            .then(s => {
                if (!s && waitForScoutSetup) { return setupScout(); }
                return s;
            })
            .then(s => req.app.scout = s)
            .then(s => s.setup())
            .then(scout => {
                if (!routePath) {
                    scout.emit(ScoutEvent.UnknownRequestPathSkipped, req.url);
                    next();
                    return;
                }

                const reqMethod = req.method.toUpperCase();

                if (scout.ignoresPath(routePath)) {
                    next();
                    return;
                }

                req.scout = { instance: scout } as ExpressScoutInfo;

                const name = `Controller/${reqMethod} ${routePath}`;
                let transactionTimeout: any;

                scout.transaction(name, (finishTransaction) => {
                    req.scout.request = scout.getCurrentRequest();
                    if (!req.scout.request) {
                        if (opts && opts.logFn) {
                            opts.logFn(`[scout] Failed to start transaction, no current request`, LogLevel.Warn);
                        }
                        next();
                        return;
                    }

                    req.scout.request
                        .addContext(ScoutContextName.Path, scout.filterRequestPath(reqUrl))
                        .then(() => {
                            const matchingHeader = REQUEST_QUEUE_TIME_HEADERS.find(h => req.get(h));
                            if (matchingHeader) {
                                const value = parseQueueTimeNS(req.get(matchingHeader));
                                return req.scout.request.addContext(
                                    ScoutContextName.QueueTimeNS,
                                    new BigNumber(requestStartTimeNS).minus(value).toString(),
                                );
                            }
                        })
                        .then(() => {
                            scout.instrument(name, finishSpan => {
                                if (requestTimeoutMs > 0) {
                                    transactionTimeout = setTimeout(() => {
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

                                onFinished(res, () => {
                                    if (transactionTimeout) { clearTimeout(transactionTimeout); }
                                    finishTransaction().then(() => delete req.scout);
                                });

                                req.scout.rootSpan = scout.getCurrentSpan();

                                // Re-enter Scout async context after any setImmediate dispatch
                                // NestJS's router and Express 5 both use setImmediate internally.
                                AsyncResource.bind(next)();
                            });
                        });
                });
            })
            .catch((err: Error) => {
                if (opts && opts.logFn) {
                    opts.logFn(`[scout] No scout instance on NestJS application:\n ${err}`, LogLevel.Error);
                }
                next();
            });
    };
}

/**
 * Class-based Scout middleware for use with NestJS's MiddlewareConsumer.
 *
 * Example:
 *   @Module({})
 *   export class AppModule implements NestModule {
 *     configure(consumer: MiddlewareConsumer) {
 *       consumer.apply(ScoutNestMiddleware).forRoutes('*');
 *     }
 *   }
 */
export class ScoutNestMiddleware {
    private readonly _inner: NestMiddleware;

    constructor(opts?: NestMiddlewareOptions) {
        this._inner = nestMiddleware(opts);
    }

    use(req: any, res: any, next: () => void): void {
        this._inner(req, res, next);
    }
}

/**
 * Returns a NestJS-compatible global exception filter that captures errors via Scout.
 *
 * Does not require @nestjs/common as a dependency — NestJS duck-types the catch() method.
 *
 * @example
 * const { nestErrorFilter } = require("@scout_apm/scout-apm");
 * // after NestFactory.create():
 * app.useGlobalFilters(nestErrorFilter());
 */
export function nestErrorFilter() {
    return {
        catch(exception: any, host: any): void {
            const { captureError } = require("./error-monitor");

            const ctx = host.switchToHttp();
            const req = ctx.getRequest();
            const res = ctx.getResponse();

            if (req) {
                captureError(
                    exception,
                    undefined,
                    {
                        controller: (req.route && req.route.path) || req.path || null,
                        action: req.method ? req.method.toUpperCase() : null,
                        module: null,
                        requestId: req.scout && req.scout.request ? req.scout.request.requestId : undefined,
                        requestUrl: req.originalUrl || req.url,
                        requestParams: (req.query || req.body)
                            ? Object.assign({}, req.query, req.body)
                            : undefined,
                        requestSession: req.session || undefined,
                    },
                );
            } else {
                captureError(exception);
            }

            // Determine HTTP status — NestJS HttpException carries getStatus()
            const status = exception && typeof exception.getStatus === "function"
                ? exception.getStatus()
                : 500;

            const message = exception instanceof Error
                ? exception.message
                : typeof exception === "string" ? exception : "Internal server error";

            res.status(status).json({ statusCode: status, message });
        },
    };
}
