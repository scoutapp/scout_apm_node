export * from "./errors";
import { DoneCallback } from "./scout";
import { ScoutConfiguration } from "./types";
export declare function setupRequireIntegrations(packages: string[], scoutConfig?: Partial<ScoutConfiguration>): void;
declare const _default: {
    api: {
        WebTransaction: {
            run(name: string, cb: DoneCallback): Promise<any>;
        };
        BackgroundTransaction: {
            run(name: string, cb: DoneCallback): Promise<any>;
        };
    };
};
export default _default;
