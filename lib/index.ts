export * from "./errors";

import { Scout, ScoutRequest, DoneCallback, SpanCallback, RequestCallback } from "./scout";
import { ScoutConfiguration, buildScoutConfiguration, JSONValue } from "./types";
import { getIntegrationForPackage } from "./integrations";
import { setGlobalScoutInstance, getGlobalScoutInstance, getOrCreateGlobalScoutInstance, EXPORT_BAG } from "./global";

// Set up PG integration
// This is needed for use in Typescript projects since `import` will not
// run global code unless you do a whole-file import
export function setupRequireIntegrations(packages: string[], scoutConfig?: Partial<ScoutConfiguration>) {
    packages = packages || [];

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

            runSync(op: string, cb: RequestCallback, scout?: Scout): any {
                const name = `Controller/${op}`;

                scout = scout || getGlobalScoutInstance();
                if (!scout) { return; }

                return scout.transactionSync(name, (request) => {
                    return cb(request);
                });
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

            runSync(op: string, cb: SpanCallback, scout?: Scout): any {
                const name = `Job/${op}`;

                scout = scout || getGlobalScoutInstance();
                if (!scout) { return; }

                return scout.instrumentSync(name, (span) => {
                    return cb(span);
                });
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
            const scout = getGlobalScoutInstance();
            return scout ? scout.getConfig() : undefined;
        },

        Context: {
            add(name: string, value: JSONValue, scout?: Scout): Promise<ScoutRequest> {
                return (scout ? Promise.resolve(scout.setup()) : getOrCreateGlobalScoutInstance())
                    .then(scout => {
                        const req = scout.getCurrentRequest();
                        if (!req) { throw new Error("Request not present"); }

                        return req.addContext({name, value});
                    });
            },

            addSync(name: string, value: JSONValue, scout?: Scout): ScoutRequest | undefined {
                scout = scout || getGlobalScoutInstance();
                if (!scout) { return; }

                const req = scout.getCurrentRequest();
                if (!req) { return; }

                return req.addContextSync({name, value});
            },
        },
    },
};
