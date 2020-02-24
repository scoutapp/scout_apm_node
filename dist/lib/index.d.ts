export * from "./errors";
import { Scout, DoneCallback, SpanCallback } from "./scout";
import { ScoutConfiguration, JSONValue } from "./types";
export declare function setupRequireIntegrations(packages: string[], scoutConfig?: Partial<ScoutConfiguration>): void;
declare const _default: {
    api: {
        WebTransaction: {
            run(op: string, cb: DoneCallback, scout?: Scout | undefined): Promise<any>;
        };
        BackgroundTransaction: {
            run(op: string, cb: DoneCallback, scout?: Scout | undefined): Promise<any>;
        };
        instrument(op: string, cb: DoneCallback, scout?: Scout | undefined): Promise<any>;
        instrumentSync(operation: string, fn: SpanCallback, scout?: Scout | undefined): Promise<any>;
        readonly Config: Partial<ScoutConfiguration>;
        Context: {
            add(name: string, value: JSONValue, scout?: Scout | undefined): Promise<void>;
        };
    };
};
export default _default;
