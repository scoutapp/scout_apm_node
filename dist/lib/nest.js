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
exports.ScoutNestMiddleware = void 0;
exports.nestMiddleware = nestMiddleware;
const on_finished_1 = __importDefault(require("on-finished"));
const async_hooks_1 = require("async_hooks");
const types_1 = require("./types");
const Constants = __importStar(require("./constants"));
const global_1 = require("./global");
const express_1 = require("./express");
const path_to_regexp_1 = require("path-to-regexp");
const getNanoTime = require("nano-time");
const BigNumber = require("big-number");
// NestJS-specific route cache — separate from the Express middleware's cache so
// the two don't interfere when both are used in the same process.
const NEST_ROUTE_INFO_LOOKUP = {};
const REQUEST_QUEUE_TIME_HEADERS = ["x-queue-start", "x-request-start"];
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
function nestMiddleware(opts) {
    const overrides = opts && opts.config ? opts.config : {};
    const config = (0, types_1.buildScoutConfiguration)(overrides);
    const options = {
        logFn: opts && opts.logFn ? opts.logFn : undefined,
        statisticsIntervalMS: opts && opts.statisticsIntervalMS ? opts.statisticsIntervalMS : undefined,
    };
    (0, global_1.setGlobalLastUsedConfiguration)(config);
    (0, global_1.setGlobalLastUsedOptions)(options);
    return (req, res, next) => {
        const requestStartTimeNS = getNanoTime();
        const scout = opts && opts.scout ? opts.scout : req.app.scout || (0, global_1.getActiveGlobalScoutInstance)();
        const setupScout = () => (0, global_1.getOrCreateActiveGlobalScoutInstance)(config, options)
            .then(s => req.app.scout = s);
        const waitForScoutSetup = opts && opts.waitForScoutSetup;
        if (!scout && !waitForScoutSetup) {
            setImmediate(setupScout);
            next();
            return;
        }
        if (!req || !req.app) {
            if (opts && opts.logFn) {
                opts.logFn(`[scout] Request object is missing/invalid (application object missing)`, types_1.LogLevel.Warn);
            }
            next();
            return;
        }
        const reqUrl = req.url;
        const preQueryUrl = reqUrl.split("?")[0];
        // NestJS routes are always registered on a nested Express Router, never as
        // top-level layers on app._router.  Skip the flat stack scan and go straight
        // to listExpressEndpoints which walks the full nested tree.
        let routePath = reqUrl === "/" ? "/" : null;
        if (!routePath) {
            try {
                let matchedRoute = Object.values(NEST_ROUTE_INFO_LOOKUP).find(r => r.regex.exec(preQueryUrl));
                if (!matchedRoute) {
                    (0, express_1.listExpressEndpoints)(req.app).forEach(r => {
                        NEST_ROUTE_INFO_LOOKUP[r.path] = {
                            ...r,
                            regex: (0, path_to_regexp_1.pathToRegexp)(r.path),
                        };
                    });
                    matchedRoute = Object.values(NEST_ROUTE_INFO_LOOKUP).find(r => r.regex.exec(preQueryUrl));
                }
                if (matchedRoute) {
                    routePath = matchedRoute.path;
                }
            }
            catch (err) {
                if (opts && opts.logFn) {
                    opts.logFn(`[scout] Failed to determine route of request, [${req.originalUrl}]`, types_1.LogLevel.Warn);
                }
            }
        }
        let requestTimeoutMs = Constants.DEFAULT_EXPRESS_REQUEST_TIMEOUT_MS;
        if (opts && "requestTimeoutMs" in opts) {
            requestTimeoutMs = opts.requestTimeoutMs;
        }
        Promise.resolve(scout)
            .then(s => {
            if (!s && waitForScoutSetup) {
                return setupScout();
            }
            return s;
        })
            .then(s => req.app.scout = s)
            .then(s => s.setup())
            .then(scout => {
            if (!routePath) {
                scout.emit(types_1.ScoutEvent.UnknownRequestPathSkipped, req.url);
                next();
                return;
            }
            const reqMethod = req.method.toUpperCase();
            if (scout.ignoresPath(routePath)) {
                next();
                return;
            }
            req.scout = { instance: scout };
            const name = `Controller/${reqMethod} ${routePath}`;
            let transactionTimeout;
            scout.transaction(name, (finishTransaction) => {
                req.scout.request = scout.getCurrentRequest();
                if (!req.scout.request) {
                    if (opts && opts.logFn) {
                        opts.logFn(`[scout] Failed to start transaction, no current request`, types_1.LogLevel.Warn);
                    }
                    next();
                    return;
                }
                req.scout.request
                    .addContext(types_1.ScoutContextName.Path, scout.filterRequestPath(reqUrl))
                    .then(() => {
                    const matchingHeader = REQUEST_QUEUE_TIME_HEADERS.find(h => req.get(h));
                    if (matchingHeader) {
                        const value = parseQueueTimeNS(req.get(matchingHeader));
                        return req.scout.request.addContext(types_1.ScoutContextName.QueueTimeNS, new BigNumber(requestStartTimeNS).minus(value).toString());
                    }
                })
                    .then(() => {
                    scout.instrument(name, finishSpan => {
                        if (requestTimeoutMs > 0) {
                            transactionTimeout = setTimeout(() => {
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
                        (0, on_finished_1.default)(res, () => {
                            if (transactionTimeout) {
                                clearTimeout(transactionTimeout);
                            }
                            finishTransaction().then(() => delete req.scout);
                        });
                        req.scout.rootSpan = scout.getCurrentSpan();
                        // Re-enter Scout async context after any setImmediate dispatch
                        // NestJS's router and Express 5 both use setImmediate internally.
                        async_hooks_1.AsyncResource.bind(next)();
                    });
                });
            });
        })
            .catch((err) => {
            if (opts && opts.logFn) {
                opts.logFn(`[scout] No scout instance on NestJS application:\n ${err}`, types_1.LogLevel.Error);
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
class ScoutNestMiddleware {
    constructor(opts) {
        this._inner = nestMiddleware(opts);
    }
    use(req, res, next) {
        this._inner(req, res, next);
    }
}
exports.ScoutNestMiddleware = ScoutNestMiddleware;
