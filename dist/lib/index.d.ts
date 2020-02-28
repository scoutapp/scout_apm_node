import * as Errors from "./errors";
import { scoutMiddleware as expressMiddleware } from "./express";
import { Scout, ScoutRequest, DoneCallback, SpanCallback, RequestCallback } from "./scout";
import { ScoutConfiguration, JSONValue, buildScoutConfiguration, consoleLogFn, buildWinstonLogFn } from "./types";
declare function setupRequireIntegrations(packages: string[], scoutConfig?: Partial<ScoutConfiguration>): void;
declare const API: {
    buildScoutConfiguration: typeof buildScoutConfiguration;
    Errors: typeof Errors;
    setupRequireIntegrations: typeof setupRequireIntegrations;
    expressMiddleware: typeof expressMiddleware;
    consoleLogFn: typeof consoleLogFn;
    buildWinstonLogFn: typeof buildWinstonLogFn;
    api: {
        WebTransaction: {
            run(op: string, cb: DoneCallback, scout?: Scout | undefined): Promise<any>;
            runSync(op: string, cb: RequestCallback, scout?: Scout | undefined): any;
        };
        BackgroundTransaction: {
            run(op: string, cb: DoneCallback, scout?: Scout | undefined): Promise<any>;
            runSync(op: string, cb: SpanCallback, scout?: Scout | undefined): any;
        };
        instrument(op: string, cb: DoneCallback, scout?: Scout | undefined): Promise<any>;
        instrumentSync(operation: string, fn: SpanCallback, scout?: Scout | undefined): Promise<any>;
        readonly Config: Partial<ScoutConfiguration> | undefined;
        Context: {
            add(name: string, value: JSONValue, scout?: Scout | undefined): Promise<void | ScoutRequest>;
            addSync(name: string, value: JSONValue, scout?: Scout | undefined): ScoutRequest | undefined;
        };
        ignoreTransaction(scout?: Scout | undefined): Promise<void | ScoutRequest>;
        ignoreTransactionSync(scout?: Scout | undefined): void | ScoutRequest;
    };
};
export = API;
