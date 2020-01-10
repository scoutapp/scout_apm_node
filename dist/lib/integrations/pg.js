"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Hook = require("require-in-the-middle");
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
// Hook into the express and mongodb module
class PGIntegration {
    constructor() {
        this.packageName = "pg";
        this.logFn = () => undefined;
    }
    getPackageName() {
        return this.packageName;
    }
    ritmHook(exportBag) {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // Make changes to the pg package to enable integration
            this.shimPG(exports);
            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;
            // Add the scoutIntegrationSymbol to show that the shim has run
            exports.Client[integrations_1.scoutIntegrationSymbol] = this;
            // Return the modified exports
            return exports;
        });
    }
    setScoutInstance(scout) {
        this.scout = scout;
    }
    setLogFn(logFn) {
        this.logFn = logFn;
    }
    shimPG(pgExport) {
        const client = pgExport.Client;
        // Shim client
        this.shimPGConnect(client);
    }
    /**
     * Shim for pg's `connect` function
     *
     * @param {Client} client - pg's `Client` class
     */
    shimPGConnect(client) {
        const original = client.connect;
        const fn = (userCallback) => {
            this.logFn("Connecting to Postgres db...", types_1.LogLevel.Debug);
            const promise = original()
                .then(() => {
                this.logFn("[scout/integrations/pg] Successfully connected to Postgres db", types_1.LogLevel.Error);
                userCallback();
            })
                .catch(err => {
                this.logFn("[scout/integrations/pg] Connection to Postgres db failed", types_1.LogLevel.Error);
                userCallback(err);
            });
            if (userCallback) {
                return;
            }
            return promise;
        };
        client.connect = fn;
    }
}
exports.PGIntegration = PGIntegration;
exports.default = new PGIntegration();
