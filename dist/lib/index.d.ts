export * from "./errors";
import { Scout, DoneCallback } from "./scout";
import { ScoutConfiguration } from "./types";
export declare function setupRequireIntegrations(packages: string[], scoutConfig?: Partial<ScoutConfiguration>): void;
declare const _default: {
    api: {
        WebTransaction: {
            run(op: string, cb: DoneCallback, scout?: Scout | undefined): Promise<any>;
        };
        BackgroundTransaction: {
            run(op: string, cb: DoneCallback, scout?: Scout | undefined): Promise<any>;
        };
    };
};
export default _default;
