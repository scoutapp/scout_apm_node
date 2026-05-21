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
const Errors = __importStar(require("./errors"));
const express_1 = require("./express");
const nest_1 = require("./nest");
const error_monitor_1 = require("./error-monitor");
const types_1 = require("./types");
const integrations_1 = require("./integrations");
const global_1 = require("./global");
// Set up PG integration
// This is needed for use in Typescript projects since `import` will not
// run global code unless you do a whole-file import
function setupRequireIntegrations(packages, scoutConfig) {
    packages = packages || [];
    packages.forEach(name => {
        const integration = (0, integrations_1.getIntegrationForPackage)(name);
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
    "https",
    "fetch",
]);
const API = {
    // Configuration building
    buildScoutConfiguration: types_1.buildScoutConfiguration,
    Errors,
    // Integrations
    setupRequireIntegrations,
    expressMiddleware: express_1.scoutMiddleware,
    errorMiddleware: express_1.errorMiddleware,
    nestMiddleware: nest_1.nestMiddleware,
    // Error monitoring
    captureError: error_monitor_1.captureError,
    // Logging
    consoleLogFn: types_1.consoleLogFn,
    buildWinstonLogFn: types_1.buildWinstonLogFn,
    // Install scout
    install: global_1.getOrCreateActiveGlobalScoutInstance,
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
