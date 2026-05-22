import { ScoutConfiguration } from "./types";
import { RequestComponents } from "./error-service";
export declare function setupErrorMonitoring(config: Partial<ScoutConfiguration>): void;
export interface CaptureErrorOptions {
    request?: {
        id?: string;
        url?: string;
        params?: object;
        session?: object;
    };
    requestComponents?: RequestComponents;
    context?: object;
    environment?: object;
}
export declare function captureError(error: Error | any, opts?: CaptureErrorOptions): void;
