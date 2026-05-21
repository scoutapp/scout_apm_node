import { ScoutConfiguration } from "./types";
export declare function setupErrorMonitoring(config: Partial<ScoutConfiguration>): void;
export interface CaptureErrorOptions {
    request?: {
        id?: string;
        url?: string;
        params?: object;
        session?: object;
    };
    context?: object;
    environment?: object;
}
export declare function captureError(error: Error | any, opts?: CaptureErrorOptions): void;
