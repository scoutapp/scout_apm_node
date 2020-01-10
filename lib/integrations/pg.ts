import * as path from "path";
import * as Hook from "require-in-the-middle";
import { ExportBag, RequireIntegration, scoutIntegrationSymbol } from "../types/integrations";
import { Scout } from "../scout";
import { Client } from "pg";
import { LogFn, LogLevel } from "../types";

// Hook into the express and mongodb module
export class PGIntegration implements RequireIntegration {
    private readonly packageName: string = "pg";
    private scout: Scout;
    private logFn: LogFn = () => undefined;

    public getPackageName() {
        return this.packageName;
    }

    public ritmHook(exportBag: ExportBag): void {
        Hook([this.getPackageName()], (exports, name, basedir) => {
            // Make changes to the pg package to enable integration
            this.shimPG(exports);

            // Save the exported package in the exportBag for Scout to use later
            exportBag[this.getPackageName()] = exports;

            // Add the scoutIntegrationSymbol to show that the shim has run
            exports.Client[scoutIntegrationSymbol] = this;

            // Return the modified exports
            return exports;
        });
    }

    public setScoutInstance(scout: Scout) {
        this.scout = scout;
    }

    public setLogFn(logFn: LogFn) {
        this.logFn = logFn;
    }

    private shimPG(pgExport: any) {
        const client = pgExport.Client;

        // Shim client
        this.shimPGConnect(client);
    }

    /**
     * Shim for pg's `connect` function
     *
     * @param {Client} client - pg's `Client` class
     */
    private shimPGConnect(client: Client) {
        const original = client.connect;

        const fn: any = (userCallback) => {
            this.logFn("Connecting to Postgres db...", LogLevel.Debug);

            const promise = original()
                .then(() => {
                    this.logFn("[scout/integrations/pg] Successfully connected to Postgres db", LogLevel.Error);
                    userCallback();
                })
                .catch(err => {
                    this.logFn("[scout/integrations/pg] Connection to Postgres db failed", LogLevel.Error);
                    userCallback(err);
                });

            if (userCallback) { return; }
            return promise;
        };

        client.connect = fn;
    }
}

export default new PGIntegration();
