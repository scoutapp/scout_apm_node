import * as Errors from "./errors";

import { scoutMiddleware as expressMiddleware, errorMiddleware } from "./express";
import { nestMiddleware as nestMiddlewareImpl, nestErrorFilter as nestErrorFilterImpl } from "./nest";
import { captureError } from "./error-monitor";

import { Scout, ScoutRequest, DoneCallback, SpanCallback, RequestCallback } from "./scout";
import { ScoutConfiguration, JSONValue, buildScoutConfiguration, consoleLogFn, buildWinstonLogFn } from "./types";
import { getIntegrationForPackage, KNOWN_PACKAGES } from "./integrations";
import { getActiveGlobalScoutInstance, getOrCreateActiveGlobalScoutInstance, EXPORT_BAG } from "./global";

// When called with no arguments, registers hooks for every known package.
// When called with a list, registers only those packages.
// Hooks are no-ops until the package is actually required — safe to call for
// packages that aren't installed.
function setupRequireIntegrations(packages?: string[]) {
    const list = packages ?? KNOWN_PACKAGES;
    list.forEach(name => {
        const integration = getIntegrationForPackage(name);
        if (integration) {
            integration.ritmHook(EXPORT_BAG);
        }
    });
}

// Auto-register all known integrations when the module is first loaded.
// CJS users who require('@scout_apm/scout-apm') before other packages get
// automatic instrumentation with no further setup.
setupRequireIntegrations();

const API = {
    // Configuration building
    buildScoutConfiguration,

    Errors,

    // Integrations
    setupRequireIntegrations,
    expressMiddleware,
    errorMiddleware,
    nestMiddleware: nestMiddlewareImpl,
    nestErrorFilter: nestErrorFilterImpl,

    // Error monitoring
    captureError,

    // Logging
    consoleLogFn,
    buildWinstonLogFn,

    // Install scout
    install: getOrCreateActiveGlobalScoutInstance,

    // init() — preferred single-call setup.
    // Registers all RITM hooks synchronously (same as require('@scout_apm/scout-apm')
    // at the top of your file), then kicks off async Scout setup.
    // Use this instead of a separate setupRequireIntegrations() + install() pair.
    init(config: Partial<ScoutConfiguration>): Promise<Scout> {
        setupRequireIntegrations();
        return getOrCreateActiveGlobalScoutInstance(config);
    },

    // instrument
    instrument(op: string, cb: DoneCallback, scout?: Scout): Promise<any> {
        return (scout ? Promise.resolve(scout.setup()) : getOrCreateActiveGlobalScoutInstance())
            .then(scout => {
                return scout.instrument(op, (finishSpan, info) => {
                    return cb(finishSpan, info);
                });
            });
    },

    // instrument
    instrumentSync(op: string, cb: SpanCallback, scout?: Scout): Promise<any> {
        return (scout ? Promise.resolve(scout.setup()) : getOrCreateActiveGlobalScoutInstance())
            .then(scout => scout.instrumentSync(op, cb));
    },

    // API
    api: {
        WebTransaction: {
            run(op: string, cb: DoneCallback, scout?: Scout): Promise<any> {
                const name = `Controller/${op}`;
                return (scout ? Promise.resolve(scout.setup()) : getOrCreateActiveGlobalScoutInstance())
                    .then(scout => scout.transaction(name, (finishRequest, other) => {
                        return scout.instrument(name, (finishSpan, info) => {
                            return cb(finishRequest, info);
                        });
                    }));
            },

            runSync(op: string, cb: RequestCallback, scout?: Scout): any {
                const name = `Controller/${op}`;

                scout = scout || getActiveGlobalScoutInstance() || undefined;
                if (!scout) { return; }

                return scout.transactionSync(name, (request) => {
                    return cb(request);
                });
            },
        },

        BackgroundTransaction: {
            run(op: string, cb: DoneCallback, scout?: Scout): Promise<any> {
                const name = `Job/${op}`;
                return (scout ? Promise.resolve(scout.setup()) : getOrCreateActiveGlobalScoutInstance())
                    .then(scout => scout.transaction(name, (finishRequest, other) => {
                        return scout.instrument(name, (finishSpan, info) => {
                            return cb(finishRequest, info);
                        });
                    }));
            },

            runSync(op: string, cb: SpanCallback, scout?: Scout): any {
                const name = `Job/${op}`;

                scout = scout || getActiveGlobalScoutInstance() || undefined;
                if (!scout) { return; }

                return scout.instrumentSync(name, (span) => {
                    return cb(span);
                });
            },
        },

        instrument(op: string, cb: DoneCallback, scout?: Scout): Promise<any> {
            return (scout ? Promise.resolve(scout.setup()) : getOrCreateActiveGlobalScoutInstance())
                .then(scout => scout.instrument(op, (finishSpan, info) => {
                    return cb(finishSpan, info);
                }));
        },

        instrumentSync(operation: string, fn: SpanCallback, scout?: Scout) {
            return (scout ? Promise.resolve(scout.setup()) : getOrCreateActiveGlobalScoutInstance())
                .then(scout => scout.instrumentSync(operation, fn));
        },

        get Config() {
            const scout = getActiveGlobalScoutInstance();
            return scout ? scout.getConfig() : undefined;
        },

        Context: {
            add(name: string, value: JSONValue, scout?: Scout): Promise<ScoutRequest | void> {
                return (scout ? Promise.resolve(scout.setup()) : getOrCreateActiveGlobalScoutInstance())
                    .then(scout => {
                        const req = scout.getCurrentRequest();
                        if (!req) { return; }

                        return req.addContext(name, value);
                    });
            },

            addSync(name: string, value: JSONValue, scout?: Scout): ScoutRequest | undefined {
                scout = scout || getActiveGlobalScoutInstance() || undefined;
                if (!scout) { return; }

                const req = scout.getCurrentRequest();
                if (!req) { return; }

                return req.addContextSync(name, value);
            },
        },

        ignoreTransaction(scout?: Scout): Promise<ScoutRequest | void> {
            return (scout ? Promise.resolve(scout.setup()) : getOrCreateActiveGlobalScoutInstance())
                .then(scout => {
                    const req = scout.getCurrentRequest();
                    if (!req) { return; }

                    return Promise.resolve(req.ignore());
                });
        },

        ignoreTransactionSync(scout?: Scout): ScoutRequest | void {
            scout = scout || getActiveGlobalScoutInstance() || undefined;
            if (!scout) { return; }

            const req = scout.getCurrentRequest();
            if (!req) { return; }

            return req.ignore();
        },
    },
};

export = API;
