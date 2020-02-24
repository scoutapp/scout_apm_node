export * from "./errors";

import { Scout, ScoutRequest, DoneCallback, SpanCallback } from "./scout";
import { ScoutConfiguration, buildScoutConfiguration, JSONValue } from "./types";
import { getIntegrationForPackage } from "./integrations";
import { setGlobalScoutInstance, getGlobalScoutInstance, getOrCreateGlobalScoutInstance, EXPORT_BAG } from "./global";

// Set up PG integration
// This is needed for use in Typescript projects since `import` will not
// run global code unless you do a whole-file import
export function setupRequireIntegrations(packages: string[], scoutConfig?: Partial<ScoutConfiguration>) {
    packages = packages || [];

    // If we're setting up the scout require integrations, let's build a scout instance
    if (!getGlobalScoutInstance()) {
        setGlobalScoutInstance(new Scout(buildScoutConfiguration(scoutConfig)));
    }

    packages.forEach(name => {
        const integration = getIntegrationForPackage(name);
        if (integration) {
            integration.ritmHook(EXPORT_BAG);
            integration.setScoutInstance(getGlobalScoutInstance());
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

    // NodeJS internals
    "http",
]);

export default {
    api: {
        WebTransaction: {
            run(op: string, cb: DoneCallback, scout?: Scout): Promise<any> {
                const name = `Controller/${op}`;
                return (scout ? Promise.resolve(scout.setup()) : getOrCreateGlobalScoutInstance())
                    .then(scout => scout.transaction(name, (finishRequest, other) => {
                        return scout.instrument(name, (finishSpan, info) => {
                            return cb(finishRequest, info);
                        });
                    }));
            },
        },

        BackgroundTransaction: {
            run(op: string, cb: DoneCallback, scout?: Scout): Promise<any> {
                const name = `Job/${op}`;
                return (scout ? Promise.resolve(scout.setup()) : getOrCreateGlobalScoutInstance())
                    .then(scout => scout.transaction(name, (finishRequest, other) => {
                        return scout.instrument(name, (finishSpan, info) => {
                            return cb(finishRequest, info);
                        });
                    }));
            },
        },

        instrument(op: string, cb: DoneCallback, scout?: Scout): Promise<any> {
            return (scout ? Promise.resolve(scout.setup()) : getOrCreateGlobalScoutInstance())
                .then(scout => scout.instrument(op, (finishSpan, info) => {
                    return cb(finishSpan, info);
                }));
        },

        instrumentSync(operation: string, fn: SpanCallback, scout?: Scout) {
            return (scout ? Promise.resolve(scout.setup()) : getOrCreateGlobalScoutInstance())
                .then(scout => scout.instrumentSync(operation, fn));
        },

        get Config() {
            return getGlobalScoutInstance().getConfig();
        },

        Context: {
            add(name: string, value: JSONValue, scout?: Scout) {
                return (scout ? Promise.resolve(scout.setup()) : getOrCreateGlobalScoutInstance())
                    .then(scout => {
                        const req = scout.getCurrentRequest();
                        if (!req) { return; }

                        req.addContext({name, value});
                    });
            },
        },
    },
};
