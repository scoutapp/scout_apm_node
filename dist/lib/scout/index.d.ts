/// <reference types="node" />
import { EventEmitter } from "events";
import { AgentDownloadOptions, ApplicationMetadata, BaseAgentRequest, BaseAgentResponse, CoreAgentVersion, JSONValue, LogFn, LogLevel, ScoutConfiguration, ScoutTag } from "../types";
import ExternalProcessAgent from "../agents/external-process";
export { default as ScoutRequest } from "./request";
export { default as ScoutSpan } from "./span";
import ScoutRequest from "./request";
import ScoutSpan from "./span";
export interface ScoutEventRequestSentData {
    request: ScoutRequest;
}
export interface ScoutOptions {
    logFn?: LogFn;
    downloadOptions?: Partial<AgentDownloadOptions>;
    appMeta?: ApplicationMetadata;
    slowRequestThresholdMs?: number;
}
export declare type DoneCallback = (done: () => void, info: {
    span?: ScoutSpan;
    parent?: ScoutSpan | ScoutRequest;
    request?: ScoutRequest;
}) => any;
export declare type SpanCallback = (span: ScoutSpan) => any;
export declare type RequestCallback = (request: ScoutRequest) => any;
export declare class Scout extends EventEmitter {
    private readonly config;
    private downloader;
    private downloaderOptions;
    private binPath;
    private logFn;
    private slowRequestThresholdMs;
    private coreAgentVersion;
    private agent;
    private processOptions;
    private applicationMetadata;
    private canUseAsyncHooks;
    private asyncNamespace;
    private syncCurrentRequest;
    private syncCurrentSpan;
    private uncaughtExceptionListenerFn;
    constructor(config?: Partial<ScoutConfiguration>, opts?: ScoutOptions);
    private get socketPath();
    getSocketFilePath(): string;
    getCoreAgentVersion(): CoreAgentVersion;
    getApplicationMetadata(): ApplicationMetadata;
    getConfig(): Partial<ScoutConfiguration>;
    getAgent(): ExternalProcessAgent;
    getSlowRequestThresholdMs(): number;
    log(msg: string, lvl: LogLevel): void;
    setup(): Promise<this>;
    shutdown(): Promise<void>;
    hasAgent(): boolean;
    /**
     * Function for checking whether a given path (URL) is ignored by scout
     *
     * @param {string} path - processed path (ex. "/api/v1/echo/:name")
     * @returns {boolean} whether the path should be ignored
     */
    ignoresPath(path: string): boolean;
    /**
     * Filter a given request path (ex. /path/to/resource) according to logic before storing with Scout
     *
     * @param {string} path
     * @returns {URL} the filtered URL object
     */
    filterRequestPath(path: string): string;
    /**
     * Start a transaction
     *
     * @param {string} name
     * @param {Function} callback
     * @returns void
     */
    transaction(name: string, cb: DoneCallback): Promise<any>;
    /**
     * Start a synchronous transaction
     *
     * @param {string} name
     */
    transactionSync(name: string, fn: RequestCallback): any;
    /**
     * Start an instrumentation, withing a given transaction
     *
     * @param {string} operation
     * @param {Function} cb
     * @returns {Promise<any>} a promsie that resolves to the result of the callback
     */
    instrument(operation: string, cb: DoneCallback): Promise<any>;
    /**
     * Instrumentation for synchronous methods
     *
     * @param {string} operation - operation name for the span
     * @param {SpanCallback} fn - function to execute
     * @param {ScoutRequest} [requestOverride] - The request on which to start the span to execute
     * @throws {NoActiveRequest} If there is no request in scoep (via async context or override param)
     */
    instrumentSync(operation: string, fn: SpanCallback, requestOverride?: ScoutRequest): any;
    /**
     * Add context to the current transaction/instrument
     *
     * @param {ScoutTag} tag
     * @returns {Promise<void>} a promsie that resolves to the result of the callback
     */
    addContext(tag: ScoutTag, parentOverride?: ScoutRequest | ScoutSpan): Promise<ScoutRequest | ScoutSpan | void>;
    /**
     * Retrieve the current request using the async hook/continuation local storage machinery
     *
     * @returns {ScoutRequest} the current active request
     */
    getCurrentRequest(): ScoutRequest | null;
    /**
     * Retrieve the current span using the async hook/continuation local storage machinery
     *
     * @returns {ScoutSpan} the current active span
     */
    getCurrentSpan(): ScoutSpan | null;
    setupIntegrations(): void;
    getSocketPath(): string;
    /**
     * Attempt to clear an async name space entry
     *
     * this.asyncNamespace.set can fail if the async context ID is already gone
     * before someone tries to clear it. This can happen if some caller moves calls to
     * another async context or if it's cleaned up suddenly
     */
    private clearAsyncNamespaceEntry;
    private createAgentForExistingSocket;
    private downloadAndLaunchAgent;
    /**
     * Create an async namespace internally for use with tracking if not already present
     */
    private createAsyncNamespace;
    /**
     * Perform some action within a context
     *
     */
    private withAsyncRequestContext;
    /**
     * Start a scout request and return a promise which resolves to the started request
     *
     * @param {ScoutRequestOptions} [options]
     * @returns {Promise<ScoutRequest>} a new scout request
     */
    private startRequest;
    /**
     * Start a scout request synchronously
     *
     * @param {ScoutRequestOptions} [options]
     * @returns {ScoutRequest} a new scout request
     */
    private startRequestSync;
    private buildAppMetadataEvent;
    private sendAppMetadataEvent;
    private sendRegistrationRequest;
    private setupAgent;
    private onUncaughtExceptionListener;
}
/**
 * Send the StartRequest message to the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutRequest} req - The original request
 * @returns {Promise<ScoutRequest>} the passed in request
 */
export declare function sendStartRequest(scout: Scout, req: ScoutRequest): Promise<ScoutRequest>;
/**
 * Send the StopRequest message to the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutRequest} req - The original request
 * @returns {Promise<ScoutRequest>} the passed in request
 */
export declare function sendStopRequest(scout: Scout, req: ScoutRequest): Promise<ScoutRequest>;
/**
 * Send the TagRequest message to the agent for a single tag
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutRequest} req - The original request
 * @param {String} name - The tag name
 * @param {String} value - The tag value
 * @returns {Promise<void>} A promise which resolves when the message has been sent
 */
export declare function sendTagRequest(scout: Scout, req: ScoutRequest, name: string, value: JSONValue | JSONValue[]): Promise<void>;
/**
 * Send the StartSpan message to the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutSpan} span - The original span
 * @returns {Promise<ScoutSpan>} the passed in span
 */
export declare function sendStartSpan(scout: Scout, span: ScoutSpan): Promise<ScoutSpan>;
/**
 * Send the TagSpan message to the agent message to the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutSpan} span - The original span
 * @param {String} name - The tag name
 * @param {String} value - The tag value
 * @returns {Promise<void>} A promise which resolves when the message has been
 */
export declare function sendTagSpan(scout: Scout, span: ScoutSpan, name: string, value: JSONValue | JSONValue[]): Promise<void>;
/**
 * Send the StopSpan message to the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutSpan} span - The original span
 * @returns {Promise<ScoutSpan>} the passed in request
 */
export declare function sendStopSpan(scout: Scout, span: ScoutSpan): Promise<ScoutSpan>;
/**
 * Helper function for sending a given request through the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {T extends BaseAgentRequest} msg - The message to send
 * @returns {Promise<T extends BaseAgentResponse>} resp - The message to send
 */
export declare function sendThroughAgent<T extends BaseAgentRequest, R extends BaseAgentResponse>(scout: Scout, msg: T, opts?: {
    async: boolean;
}): Promise<R | void>;
