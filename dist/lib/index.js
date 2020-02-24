"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./errors"));
const scout_1 = require("./scout");
const types_1 = require("./types");
const integrations_1 = require("./integrations");
const global_1 = require("./global");
// Set up PG integration
// This is needed for use in Typescript projects since `import` will not
// run global code unless you do a whole-file import
function setupRequireIntegrations(packages, scoutConfig) {
    packages = packages || [];
    // If we're setting up the scout require integrations, let's build a scout instance
    if (!global_1.getGlobalScoutInstance()) {
        global_1.setGlobalScoutInstance(new scout_1.Scout(types_1.buildScoutConfiguration(scoutConfig)));
    }
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
        },
    },
};
