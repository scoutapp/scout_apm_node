"use strict";
const Errors = require("./errors");
const express_1 = require("./express");
const types_1 = require("./types");
const integrations_1 = require("./integrations");
const global_1 = require("./global");
// Set up PG integration
// This is needed for use in Typescript projects since `import` will not
// run global code unless you do a whole-file import
function setupRequireIntegrations(packages, scoutConfig) {
    packages = packages || [];
    packages.forEach(name => {
        const integration = integrations_1.getIntegrationForPackage(name);
        if (integration) {
            integration.ritmHook(global_1.EXPORT_BAG);
        }
    });
}
// For pure NodeJS contexts this will be run automatically
setupRequireIntegrations([
    // Databases
    "pg",
    "mysql",
    "mysql2",
    // Templating
    "pug",
    "mustache",
    "ejs",
    // Web frameworks
    "express",
    "nuxt",
    // NodeJS internals
    "http",
]);
const API = {
    // Configuration building
    buildScoutConfiguration: types_1.buildScoutConfiguration,
    Errors,
    // Ingetrations
    setupRequireIntegrations,
    expressMiddleware: express_1.scoutMiddleware,
    // Logging
    consoleLogFn: types_1.consoleLogFn,
    buildWinstonLogFn: types_1.buildWinstonLogFn,
    // Install scout
    install: global_1.getOrCreateActiveGlobalScoutInstance,
    // instrument
    instrument(op, cb, scout) {
        return (scout ? Promise.resolve(scout.setup()) : global_1.getOrCreateActiveGlobalScoutInstance())
            .then(scout => {
            return scout.instrument(op, (finishSpan, info) => {
                return cb(finishSpan, info);
            });
        });
    },
    // instrument
    instrumentSync(op, cb, scout) {
        return (scout ? Promise.resolve(scout.setup()) : global_1.getOrCreateActiveGlobalScoutInstance())
            .then(scout => scout.instrumentSync(op, cb));
    },
    // API
    api: {
        WebTransaction: {
            run(op, cb, scout) {
                const name = `Controller/${op}`;
                return (scout ? Promise.resolve(scout.setup()) : global_1.getOrCreateActiveGlobalScoutInstance())
                    .then(scout => scout.transaction(name, (finishRequest, other) => {
                    return scout.instrument(name, (finishSpan, info) => {
                        return cb(finishRequest, info);
                    });
                }));
            },
            runSync(op, cb, scout) {
                const name = `Controller/${op}`;
                scout = scout || global_1.getActiveGlobalScoutInstance() || undefined;
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
                return (scout ? Promise.resolve(scout.setup()) : global_1.getOrCreateActiveGlobalScoutInstance())
                    .then(scout => scout.transaction(name, (finishRequest, other) => {
                    return scout.instrument(name, (finishSpan, info) => {
                        return cb(finishRequest, info);
                    });
                }));
            },
            runSync(op, cb, scout) {
                const name = `Job/${op}`;
                scout = scout || global_1.getActiveGlobalScoutInstance() || undefined;
                if (!scout) {
                    return;
                }
                return scout.instrumentSync(name, (span) => {
                    return cb(span);
                });
            },
        },
        instrument(op, cb, scout) {
            return (scout ? Promise.resolve(scout.setup()) : global_1.getOrCreateActiveGlobalScoutInstance())
                .then(scout => scout.instrument(op, (finishSpan, info) => {
                return cb(finishSpan, info);
            }));
        },
        instrumentSync(operation, fn, scout) {
            return (scout ? Promise.resolve(scout.setup()) : global_1.getOrCreateActiveGlobalScoutInstance())
                .then(scout => scout.instrumentSync(operation, fn));
        },
        get Config() {
            const scout = global_1.getActiveGlobalScoutInstance();
            return scout ? scout.getConfig() : undefined;
        },
        Context: {
            add(name, value, scout) {
                return (scout ? Promise.resolve(scout.setup()) : global_1.getOrCreateActiveGlobalScoutInstance())
                    .then(scout => {
                    const req = scout.getCurrentRequest();
                    if (!req) {
                        return;
                    }
                    return req.addContext(name, value);
                });
            },
            addSync(name, value, scout) {
                scout = scout || global_1.getActiveGlobalScoutInstance() || undefined;
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
            return (scout ? Promise.resolve(scout.setup()) : global_1.getOrCreateActiveGlobalScoutInstance())
                .then(scout => {
                const req = scout.getCurrentRequest();
                if (!req) {
                    return;
                }
                return Promise.resolve(req.ignore());
            });
        },
        ignoreTransactionSync(scout) {
            scout = scout || global_1.getActiveGlobalScoutInstance() || undefined;
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
