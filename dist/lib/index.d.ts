import * as Errors from "./errors";
import { scoutMiddleware as expressMiddleware, errorMiddleware } from "./express";
import { nestMiddleware as nestMiddlewareImpl, nestErrorFilter as nestErrorFilterImpl } from "./nest";
import { captureError } from "./error-monitor";
import { trackJobQueueTime } from "./job-queue-time";
import { Scout, ScoutRequest, DoneCallback, SpanCallback, RequestCallback } from "./scout";
import { ScoutConfiguration, JSONValue, buildScoutConfiguration, consoleLogFn, buildWinstonLogFn } from "./types";
import { getOrCreateActiveGlobalScoutInstance } from "./global";
declare function setupRequireIntegrations(packages?: string[]): void;
declare const API: {
    buildScoutConfiguration: typeof buildScoutConfiguration;
    Errors: typeof Errors;
    setupRequireIntegrations: typeof setupRequireIntegrations;
    expressMiddleware: typeof expressMiddleware;
    errorMiddleware: typeof errorMiddleware;
    nestMiddleware: typeof nestMiddlewareImpl;
    nestErrorFilter: typeof nestErrorFilterImpl;
    captureError: typeof captureError;
    trackJobQueueTime: typeof trackJobQueueTime;
    consoleLogFn: typeof consoleLogFn;
    buildWinstonLogFn: typeof buildWinstonLogFn;
    install: typeof getOrCreateActiveGlobalScoutInstance;
    init(config: Partial<ScoutConfiguration>): Promise<Scout>;
    instrument(op: string, cb: DoneCallback, scout?: Scout): Promise<any>;
    instrumentSync(op: string, cb: SpanCallback, scout?: Scout): Promise<any>;
    api: {
        WebTransaction: {
            run(op: string, cb: DoneCallback, scout?: Scout): Promise<any>;
            runSync(op: string, cb: RequestCallback, scout?: Scout): any;
        };
        BackgroundTransaction: {
            run(op: string, cb: DoneCallback, scout?: Scout): Promise<any>;
            runSync(op: string, cb: SpanCallback, scout?: Scout): any;
        };
        instrument(op: string, cb: DoneCallback, scout?: Scout): Promise<any>;
        instrumentSync(operation: string, fn: SpanCallback, scout?: Scout): Promise<any>;
        readonly Config: Partial<ScoutConfiguration> | undefined;
        Context: {
            add(name: string, value: JSONValue, scout?: Scout): Promise<ScoutRequest | void>;
            addSync(name: string, value: JSONValue, scout?: Scout): ScoutRequest | undefined;
        };
        ignoreTransaction(scout?: Scout): Promise<ScoutRequest | void>;
        ignoreTransactionSync(scout?: Scout): ScoutRequest | void;
    };
};
export = API;
