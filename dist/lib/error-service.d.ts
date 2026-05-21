import { ScoutConfiguration } from "./types";
export interface ErrorPayload {
    exception_class: string;
    message: string;
    request_id?: string;
    request_uri?: string;
    request_params?: object | null;
    request_session?: object | null;
    environment?: object | null;
    trace: string[];
    context?: object;
    host: string;
    revision_sha?: string;
}
export declare class ErrorService {
    private queue;
    private timer;
    private config;
    constructor(config: Partial<ScoutConfiguration>);
    start(): void;
    stop(): void;
    enqueue(error: ErrorPayload): void;
    private flush;
    private send;
}
