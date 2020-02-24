"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./errors"));
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
            integration.setScoutInstance(global_1.getGlobalScoutInstance());
        }
    });
}
exports.setupRequireIntegrations = setupRequireIntegrations;
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
    // NodeJS internals
    "http",
]);
exports.default = {
    api: {
        WebTransaction: {
            run(op, cb, scout) {
                const name = `Controller/${op}`;
                return (scout ? Promise.resolve(scout.setup()) : global_1.getOrCreateGlobalScoutInstance())
                    .then(scout => scout.transaction(name, (finishRequest, other) => {
                    return scout.instrument(name, (finishSpan, info) => {
                        return cb(finishRequest, info);
                    });
                }));
            },
            runSync(op, cb, scout) {
                const name = `Controller/${op}`;
                scout = scout || global_1.getGlobalScoutInstance();
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
                return (scout ? Promise.resolve(scout.setup()) : global_1.getOrCreateGlobalScoutInstance())
                    .then(scout => scout.transaction(name, (finishRequest, other) => {
                    return scout.instrument(name, (finishSpan, info) => {
                        return cb(finishRequest, info);
                    });
                }));
            },
            runSync(op, cb, scout) {
                const name = `Job/${op}`;
                scout = scout || global_1.getGlobalScoutInstance();
                if (!scout) {
                    return;
                }
                return scout.instrumentSync(name, (span) => {
                    return cb(span);
                });
            },
        },
        instrument(op, cb, scout) {
            return (scout ? Promise.resolve(scout.setup()) : global_1.getOrCreateGlobalScoutInstance())
                .then(scout => scout.instrument(op, (finishSpan, info) => {
                return cb(finishSpan, info);
            }));
        },
        instrumentSync(operation, fn, scout) {
            return (scout ? Promise.resolve(scout.setup()) : global_1.getOrCreateGlobalScoutInstance())
                .then(scout => scout.instrumentSync(operation, fn));
        },
        get Config() {
            const scout = global_1.getGlobalScoutInstance();
            return scout ? scout.getConfig() : undefined;
        },
        Context: {
            add(name, value, scout) {
                return (scout ? Promise.resolve(scout.setup()) : global_1.getOrCreateGlobalScoutInstance())
                    .then(scout => {
                    const req = scout.getCurrentRequest();
                    if (!req) {
                        return;
                    }
                    return req.addContext({ name, value });
                });
            },
            addSync(name, value, scout) {
                scout = scout || global_1.getGlobalScoutInstance();
                if (!scout) {
                    return;
                }
                const req = scout.getCurrentRequest();
                if (!req) {
                    return;
                }
                return req.addContextSync({ name, value });
            },
        },
        ignoreTransaction(scout) {
            return (scout ? Promise.resolve(scout.setup()) : global_1.getOrCreateGlobalScoutInstance())
                .then(scout => {
                const req = scout.getCurrentRequest();
                if (!req) {
                    return;
                }
                return Promise.resolve(req.ignore());
            });
        },
        ignoreTransactionSync(scout) {
            scout = scout || global_1.getGlobalScoutInstance();
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
