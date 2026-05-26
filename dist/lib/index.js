"use strict";
const tslib_1 = require("tslib");
const Errors = tslib_1.__importStar(require("./errors"));
const express_1 = require("./express");
const nest_1 = require("./nest");
const error_monitor_1 = require("./error-monitor");
const types_1 = require("./types");
const integrations_1 = require("./integrations");
const global_1 = require("./global");
// When called with no arguments, registers hooks for every known package.
// When called with a list, registers only those packages.
// Hooks are no-ops until the package is actually required — safe to call for
// packages that aren't installed.
function setupRequireIntegrations(packages) {
    const list = packages ?? integrations_1.KNOWN_PACKAGES;
    list.forEach(name => {
        const integration = (0, integrations_1.getIntegrationForPackage)(name);
        if (integration) {
            integration.ritmHook(global_1.EXPORT_BAG);
        }
    });
}
// Auto-register all known integrations when the module is first loaded.
// CJS users who require('@scout_apm/scout-apm') before other packages get
// automatic instrumentation with no further setup.
setupRequireIntegrations();
const API = {
    // Configuration building
    buildScoutConfiguration: types_1.buildScoutConfiguration,
    Errors,
    // Integrations
    setupRequireIntegrations,
    expressMiddleware: express_1.scoutMiddleware,
    errorMiddleware: express_1.errorMiddleware,
    nestMiddleware: nest_1.nestMiddleware,
    nestErrorFilter: nest_1.nestErrorFilter,
    // Error monitoring
    captureError: error_monitor_1.captureError,
    // Logging
    consoleLogFn: types_1.consoleLogFn,
    buildWinstonLogFn: types_1.buildWinstonLogFn,
    // Install scout
    install: global_1.getOrCreateActiveGlobalScoutInstance,
    // init() — preferred single-call setup.
    // Registers all RITM hooks synchronously (same as require('@scout_apm/scout-apm')
    // at the top of your file), then kicks off async Scout setup.
    // Use this instead of a separate setupRequireIntegrations() + install() pair.
    init(config) {
        setupRequireIntegrations();
        return (0, global_1.getOrCreateActiveGlobalScoutInstance)(config);
    },
    // instrument
    instrument(op, cb, scout) {
        return (scout ? Promise.resolve(scout.setup()) : (0, global_1.getOrCreateActiveGlobalScoutInstance)())
            .then(scout => {
            return scout.instrument(op, (finishSpan, info) => {
                return cb(finishSpan, info);
            });
        });
    },
    // instrument
    instrumentSync(op, cb, scout) {
        return (scout ? Promise.resolve(scout.setup()) : (0, global_1.getOrCreateActiveGlobalScoutInstance)())
            .then(scout => scout.instrumentSync(op, cb));
    },
    // API
    api: {
        WebTransaction: {
            run(op, cb, scout) {
                const name = `Controller/${op}`;
                return (scout ? Promise.resolve(scout.setup()) : (0, global_1.getOrCreateActiveGlobalScoutInstance)())
                    .then(scout => scout.transaction(name, (finishRequest, other) => {
                    return scout.instrument(name, (finishSpan, info) => {
                        return cb(finishRequest, info);
                    });
                }));
            },
            runSync(op, cb, scout) {
                const name = `Controller/${op}`;
                scout = scout || (0, global_1.getActiveGlobalScoutInstance)() || undefined;
                if (!scout) {
                    return;
                }
                return scout.transactionSync(name, (request) => {
                    return cb(request);
                });
            },
        },
        BackgroundTransaction: {
            run(op, cb, scout) {
                const name = `Job/${op}`;
                return (scout ? Promise.resolve(scout.setup()) : (0, global_1.getOrCreateActiveGlobalScoutInstance)())
                    .then(scout => scout.transaction(name, (finishRequest, other) => {
                    return scout.instrument(name, (finishSpan, info) => {
                        return cb(finishRequest, info);
                    });
                }));
            },
            runSync(op, cb, scout) {
                const name = `Job/${op}`;
                scout = scout || (0, global_1.getActiveGlobalScoutInstance)() || undefined;
                if (!scout) {
                    return;
                }
                return scout.instrumentSync(name, (span) => {
                    return cb(span);
                });
            },
        },
        instrument(op, cb, scout) {
            return (scout ? Promise.resolve(scout.setup()) : (0, global_1.getOrCreateActiveGlobalScoutInstance)())
                .then(scout => scout.instrument(op, (finishSpan, info) => {
                return cb(finishSpan, info);
            }));
        },
        instrumentSync(operation, fn, scout) {
            return (scout ? Promise.resolve(scout.setup()) : (0, global_1.getOrCreateActiveGlobalScoutInstance)())
                .then(scout => scout.instrumentSync(operation, fn));
        },
        get Config() {
            const scout = (0, global_1.getActiveGlobalScoutInstance)();
            return scout ? scout.getConfig() : undefined;
        },
        Context: {
            add(name, value, scout) {
                return (scout ? Promise.resolve(scout.setup()) : (0, global_1.getOrCreateActiveGlobalScoutInstance)())
                    .then(scout => {
                    const req = scout.getCurrentRequest();
                    if (!req) {
                        return;
                    }
                    return req.addContext(name, value);
                });
            },
            addSync(name, value, scout) {
                scout = scout || (0, global_1.getActiveGlobalScoutInstance)() || undefined;
                if (!scout) {
                    return;
                }
                const req = scout.getCurrentRequest();
                if (!req) {
                    return;
                }
                return req.addContextSync(name, value);
            },
        },
        ignoreTransaction(scout) {
            return (scout ? Promise.resolve(scout.setup()) : (0, global_1.getOrCreateActiveGlobalScoutInstance)())
                .then(scout => {
                const req = scout.getCurrentRequest();
                if (!req) {
                    return;
                }
                return Promise.resolve(req.ignore());
            });
        },
        ignoreTransactionSync(scout) {
            scout = scout || (0, global_1.getActiveGlobalScoutInstance)() || undefined;
            if (!scout) {
                return;
            }
            const req = scout.getCurrentRequest();
            if (!req) {
                return;
            }
            return req.ignore();
        },
    },
};
module.exports = API;
