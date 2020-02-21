import { EventEmitter } from "events";
import * as path from "path";
import * as process from "process";
import { v4 as uuidv4 } from "uuid";
import * as nrc from "node-request-context";
import * as cls from "continuation-local-storage";
import { Namespace } from "node-request-context";
import * as semver from "semver";
import { pathExists } from "fs-extra";

import {
    APIVersion,
    Agent,
    AgentDownloadOptions,
    AgentDownloader,
    AgentEvent,
    ApplicationEventType,
    ApplicationMetadata,
    BaseAgentRequest,
    BaseAgentResponse,
    CoreAgentVersion,
    JSONValue,
    LogFn,
    LogLevel,
    isLogLevel,
    ProcessOptions,
    ScoutConfiguration,
    ScoutContextName,
    ScoutEvent,
    ScoutTag,
    URIReportingLevel,
    buildDownloadOptions,
    buildProcessOptions,
    buildScoutConfiguration,
    generateTriple,
    parseLogLevel,
    scrubRequestPath,
    scrubRequestPathParams,
} from "../types";
import { EXPORT_BAG } from "../index";
import { getIntegrationForPackage } from "../integrations";

import WebAgentDownloader from "../agent-downloaders/web";
import ExternalProcessAgent from "../agents/external-process";
import * as Requests from "../protocol/v1/requests";
import * as Constants from "../constants";
import * as Errors from "../errors";

export { default as ScoutRequest } from "./request";
export { default as ScoutSpan } from "./span";

import ScoutRequest from "./request";
import { ScoutRequestOptions } from "./request";
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

export type DoneCallback = (
    done: () => void,
    info: {span?: ScoutSpan, parent?: ScoutSpan | ScoutRequest, request?: ScoutRequest},
) => any;

const DONE_NOTHING = () => undefined;

export type SpanCallback = (span: ScoutSpan) => any;
export type RequestCallback = (request: ScoutRequest) => any;

const ASYNC_NS = "scout";
const ASYNC_NS_REQUEST = `${ASYNC_NS}.request`;
const ASYNC_NS_SPAN = `${ASYNC_NS}.span`;

export class Scout extends EventEmitter {
    private readonly config: Partial<ScoutConfiguration>;

    private downloader: AgentDownloader;
    private downloaderOptions: AgentDownloadOptions = {};
    private binPath: string;
    private logFn: LogFn;
    private slowRequestThresholdMs: number = Constants.DEFAULT_SLOW_REQUEST_THRESHOLD_MS;

    private coreAgentVersion: CoreAgentVersion;
    private agent: ExternalProcessAgent;
    private processOptions: ProcessOptions;
    private applicationMetadata: ApplicationMetadata;
    private canUseAsyncHooks: boolean = false;

    private asyncNamespace: any;
    private syncCurrentRequest: ScoutRequest | null = null;
    private syncCurrentSpan: ScoutSpan | null = null;

    private uncaughtExceptionListenerFn: (err) => void;

    constructor(config?: Partial<ScoutConfiguration>, opts?: ScoutOptions) {
        super();

        this.config = config || buildScoutConfiguration();
        this.logFn = opts && opts.logFn ? opts.logFn : () => undefined;

        if (opts) {
            if (opts.downloadOptions) { this.downloaderOptions = opts.downloadOptions; }
            if (opts.slowRequestThresholdMs) { this.slowRequestThresholdMs = opts.slowRequestThresholdMs; }
        }

        this.applicationMetadata = new ApplicationMetadata(
            this.config,
            opts && opts.appMeta ? opts.appMeta : {},
        );

        let version = this.config.coreAgentVersion || Constants.DEFAULT_CORE_AGENT_VERSION;
        if (version[0] === "v") { version = version.slice(1); }

        // Build expected bin & socket path based on current version
        const triple = generateTriple();
        this.binPath = path.join(
            Constants.DEFAULT_CORE_AGENT_DOWNLOAD_CACHE_DIR,
            `scout_apm_core-v${version}-${triple}`,
            Constants.CORE_AGENT_BIN_FILE_NAME,
        );

        // Check node version for before/after
        this.canUseAsyncHooks = semver.gte(process.version, "8.9.0");

        // Create async namespace if it does not exist
        this.createAsyncNamespace();

        // If the logFn that is provided has a 'logger' attempt to set the log level to the passed in logger's level
        if (this.logFn && this.logFn.logger && this.logFn.logger.level && isLogLevel(this.logFn.logger.level)) {
            this.config.logLevel = parseLogLevel(this.logFn.logger.level);
        }
    }

    private get socketPath() {
        if (this.config.socketPath) {
            return this.config.socketPath;
        }

        return path.join(
            path.dirname(this.binPath),
            Constants.DEFAULT_SOCKET_FILE_NAME,
        );
    }

    public getSocketFilePath(): string {
        return this.socketPath.slice();
    }

    public getCoreAgentVersion(): CoreAgentVersion {
        return new CoreAgentVersion(this.coreAgentVersion.raw);
    }

    public getApplicationMetadata(): ApplicationMetadata {
        return Object.assign({}, this.applicationMetadata);
    }

    public getConfig(): Partial<ScoutConfiguration> {
        return this.config;
    }

    public getAgent(): ExternalProcessAgent {
        return this.agent;
    }

    public getSlowRequestThresholdMs(): number {
        return this.slowRequestThresholdMs;
    }

    public log(msg: string, lvl: LogLevel) {
        this.logFn(msg, lvl);
    }

    public setup(): Promise<this> {
        // Return early if agent has already been set up
        if (this.agent) { return Promise.resolve(this); }

        const shouldLaunch = this.config.coreAgentLaunch;

        // If the socket path exists then we may be able to skip downloading and launching
        return (shouldLaunch ? this.downloadAndLaunchAgent() : this.createAgentForExistingSocket())
            .then(() => this.agent.connect())
            .then(() => this.log("[scout] successfully connected to agent", LogLevel.Debug))
            .then(() => {
                if (!this.config.name) {
                    this.log("[scout] 'name' configuration value missing", LogLevel.Warn);
                }
                if (!this.config.key) {
                    this.log("[scout] 'key' missing in configuration", LogLevel.Warn);
                }
            })
        // Register the application
            .then(() => this.sendRegistrationRequest())
        // Send the application metadata
            .then(() => this.sendAppMetadataEvent())
        // Set up integration(s)
            .then(() => this.setupIntegrations())
        // Set up process uncaught exception handler
            .then(() => {
                this.uncaughtExceptionListenerFn = (err) => this.onUncaughtExceptionListener(err);
                process.on("uncaughtException", this.uncaughtExceptionListenerFn);
            })
            .then(() => this);
    }

    public shutdown(): Promise<void> {
        if (!this.agent) {
            this.log("[scout] shutdown called but no agent to shutdown is present", LogLevel.Error);
            return Promise.reject(new Errors.NoAgentPresent());
        }

        // Disable the uncaughtException listener
        process.removeListener("uncaughtException", this.uncaughtExceptionListenerFn);

        return this.agent
            .disconnect()
            .then(() => {
                if (this.config.allowShutdown) {
                    return this.agent.stopProcess();
                }
            });
    }

    public hasAgent(): boolean {
        return typeof this.agent !== "undefined" && this.agent !== null;
    }

    /**
     * Function for checking whether a given path (URL) is ignored by scout
     *
     * @param {string} path - processed path (ex. "/api/v1/echo/:name")
     * @returns {boolean} whether the path should be ignored
     */
    public ignoresPath(path: string): boolean {
        this.log("[scout] checking path [${path}] against ignored paths", LogLevel.Trace);

        // If ignore isn't specified or if empty, then nothing is ignored
        if (!this.config.ignore || this.config.ignore.length === 0) {
            return false;
        }

        const matchingPrefix = this.config.ignore.find(prefix => path.indexOf(prefix) === 0);

        if (matchingPrefix) {
            this.log("[scout] ignoring path [${path}] matching prefix [${matchingPrefix}]", LogLevel.Debug);
            this.emit(ScoutEvent.IgnoredPathDetected, path);
        }

        return matchingPrefix !== undefined;
    }

    /**
     * Filter a given request path (ex. /path/to/resource) according to logic before storing with Scout
     *
     * @param {string} path
     * @returns {URL} the filtered URL object
     */
    public filterRequestPath(path: string): string {
        switch (this.config.uriReporting) {
            case URIReportingLevel.FilteredParams:
                return scrubRequestPathParams(path);
            case URIReportingLevel.Path:
                return scrubRequestPath(path);
            default:
                return path;
        }
    }

    /**
     * Start a transaction
     *
     * @param {string} name
     * @param {Function} callback
     * @returns void
     */
    public transaction(name: string, cb: DoneCallback): Promise<any> {
        this.log(`[scout] Starting transaction [${name}]`, LogLevel.Debug);

        let result;
        let ranContext = false;

        // Setup if necessary then then perform the async request context
        return this.setup()
            .then(() => {
                ranContext = true;
                result = this.withAsyncRequestContext(cb);
                return result;
            })
            .catch(err => {
                this.log("[scout] Scout setup failed: ${err}", LogLevel.Error);
                if (!ranContext) {
                    return this.withAsyncRequestContext(cb);
                }
            });
    }

    /**
     * Start a synchronous transaction
     *
     * @param {string} name
     */
    public transactionSync(name: string, fn: RequestCallback): any {
        this.log(`[scout] Starting transaction [${name}]`, LogLevel.Debug);

        // Create & start the request synchronously
        const request = this.startRequestSync();
        this.syncCurrentRequest = request;

        const result = fn(request);
        request.stopSync();

        // Reset the current request as sync
        this.syncCurrentRequest = null;

        // Fire and forget the request
        request.finishAndSend();

        return result;
    }

    /**
     * Start an instrumentation, withing a given transaction
     *
     * @param {string} operation
     * @param {Function} cb
     * @returns {Promise<any>} a promsie that resolves to the result of the callback
     */
    public instrument(operation: string, cb: DoneCallback): Promise<any> {
        this.log(`[scout] Instrumenting operation [${operation}]`, LogLevel.Debug);

        const parent = this.getCurrentSpan() || this.getCurrentRequest();
        const request = this.getCurrentRequest();

        // If no request is currently underway
        if (!parent || !request) {
            this.log(
                "[scout] Failed to start instrumentation, no current transaction/parent instrumentation",
                LogLevel.Error,
            );
            return Promise.resolve(cb(DONE_NOTHING, {}));
        }

        let result;
        let ranCb = false;

        this.log(
            `[scout] Starting child span for operation [${operation}], parent id [${parent.id}]`,
            LogLevel.Debug,
        );

        let span: ScoutSpan;

        const doneFn = () => {
            // Sometimes the async namespace is actually gone *before* doneFn gets called
            this.clearAsyncNamespaceEntry(ASYNC_NS_SPAN);
            this.log(`[scout] Stopping span with ID [${span.id}]`, LogLevel.Debug);
            return span.stop();
        };

        return parent
        // Start the child span
            .startChildSpan(operation)
        // Set up the async namespace, run the function
            .then(s => span = s)
            .then(() => {
                this.asyncNamespace.set(ASYNC_NS_SPAN, span);
                ranCb = true;
                result = cb(doneFn, {span, request, parent});

                // Ensure that the result is a promise
                return Promise.resolve(result);
            })
        // Return the result
            .catch(err => {
                // It's possible that an error happened *before* the span could be set
                if (!ranCb) {
                    result = span ? cb(doneFn, {span, request, parent}) : cb(() => undefined, {span, request, parent});
                }
                this.log("[scout] failed to send start span", LogLevel.Error);

                // Ensure that the result is a promise
                return Promise.resolve(result);
            });
    }

    /**
     * Instrumentation for synchronous methods
     *
     * @param {string} operation - operation name for the span
     * @param {SpanCallback} fn - function to execute
     * @param {ScoutRequest} [requestOverride] - The request on which to start the span to execute
     * @throws {NoActiveRequest} If there is no request in scoep (via async context or override param)
     */
    public instrumentSync(operation: string, fn: SpanCallback, requestOverride?: ScoutRequest): any {
        let parent = requestOverride || this.syncCurrentSpan || this.syncCurrentRequest;
        // Check the async sources in case we're in a async context but not a sync one
        parent = parent || this.getCurrentSpan() || this.getCurrentRequest();

        // If the request isn't present then we throw an error early
        if (!parent) {
            this.log(
                "[scout] parent context missing for synchronous instrumentation (via async context or passed in)",
                LogLevel.Warn,
            );

            throw new Errors.NoActiveParentContext();
        }

        // Start a child span of the parent synchronously
        const span = parent.startChildSpanSync(operation);
        this.syncCurrentSpan = span;

        span.startSync();
        const result = fn(span);
        span.stopSync();

        // Clear out the current span for synchronous operations
        this.syncCurrentSpan = null;

        return result;
    }

    /**
     * Add context to the current transaction/instrument
     *
     * @param {ScoutTag} tag
     * @returns {Promise<void>} a promsie that resolves to the result of the callback
     */
    public addContext(
        tag: ScoutTag,
        parentOverride?: ScoutRequest | ScoutSpan,
    ): Promise<ScoutRequest | ScoutSpan | void> {
        let parent = this.getCurrentSpan() || this.getCurrentRequest();

        // If we're not in an async context then attempt to use the sync parent span or request
        if (!parent) { parent = this.syncCurrentSpan || this.syncCurrentRequest; }

        // If a parent override was provided, use it
        if (parentOverride) { parent = parentOverride; }

        // If no request is currently underway
        if (!parent) {
            this.log("[scout] Failed to add context, no current parent instrumentation", LogLevel.Error);
            return Promise.resolve();
        }

        this.log(`[scout] Adding context (${tag}) to parent ${parent.id}`, LogLevel.Debug);

        return parent.addContext(tag);
    }

    /**
     * Retrieve the current request using the async hook/continuation local storage machinery
     *
     * @returns {ScoutRequest} the current active request
     */
    public getCurrentRequest(): ScoutRequest | null {
        try {
            return this.asyncNamespace.get(ASYNC_NS_REQUEST);
        } catch {
            return null;
        }
    }

    /**
     * Retrieve the current span using the async hook/continuation local storage machinery
     *
     * @returns {ScoutSpan} the current active span
     */
    public getCurrentSpan(): ScoutSpan | null {
        try {
            return this.asyncNamespace.get(ASYNC_NS_SPAN);
        } catch {
            return null;
        }
    }

    // Setup integrations
    public setupIntegrations() {
        Object.keys(EXPORT_BAG)
            .map(packageName => getIntegrationForPackage(packageName))
            .forEach(integration => integration.setScoutInstance(this));
    }

    public getSocketPath() {
        return `unix://${this.socketPath}`;
    }

    /**
     * Attempt to clear an async name space entry
     *
     * this.asyncNamespace.set can fail if the async context ID is already gone
     * before someone tries to clear it. This can happen if some caller moves calls to
     * another async context or if it's cleaned up suddenly
     */
    private clearAsyncNamespaceEntry(key: string) {
        try {
            this.asyncNamespace.set(key, undefined);
        } catch {
            this.logFn("failed to clear async namespace", LogLevel.Debug);
        }
    }

    // Helper for creating an ExternalProcessAgent for an existing, listening agent
    private createAgentForExistingSocket(socketPath?: string): Promise<ExternalProcessAgent> {
        this.log(`[scout] detected existing socket @ [${this.socketPath}], skipping agent launch`, LogLevel.Debug);

        socketPath = socketPath || this.socketPath;

        // Check if the socketPath exists
        return pathExists(socketPath)
            .then(exists => {
                if (!exists) {
                    throw new Errors.InvalidConfiguration("socket @ path [${socketPath}] does not exist");
                }
            })
        // Build process options and agent
            .then(() => {
                this.processOptions = new ProcessOptions(
                    this.binPath,
                    this.getSocketPath(),
                    buildProcessOptions(this.config),
                );

                return new ExternalProcessAgent(this.processOptions, this.logFn);
            })
            .then(agent => this.setupAgent(agent));
    }

    // Helper for downloading and launching an agent
    private downloadAndLaunchAgent(): Promise<ExternalProcessAgent> {
        this.log(`[scout] downloading and launching agent`, LogLevel.Debug);
        this.downloader = new WebAgentDownloader({logFn: this.logFn});

        // Ensure coreAgentVersion is present
        if (!this.config.coreAgentVersion) {
            const err = new Error("No core agent version specified!");
            this.log(err.message, LogLevel.Error);
            return Promise.reject(err);
        }

        this.coreAgentVersion = new CoreAgentVersion(this.config.coreAgentVersion);

        // Build options for download
        this.downloaderOptions = Object.assign(
            {
                cacheDir: path.dirname(this.binPath),
                updateCache: true,
            },
            this.downloaderOptions,
            buildDownloadOptions(this.config),
        );

        // Download the appropriate binary
        return this.downloader
            .download(this.coreAgentVersion, this.downloaderOptions)
            .then(bp => {
                this.binPath = bp;
                this.log(`[scout] using socket path [${this.socketPath}]`, LogLevel.Debug);
            })
        // Build options for the agent and create the agent
            .then(() => {
                this.processOptions = new ProcessOptions(
                    this.binPath,
                    this.getSocketPath(),
                    buildProcessOptions(this.config),
                );

                const agent = new ExternalProcessAgent(this.processOptions, this.logFn);
                return this.setupAgent(agent);
            })
        // Once we have an agent (this.agent is also set), then start, connect, and register
            .then(() => {
                this.log(`[scout] starting process w/ bin @ path [${this.binPath}]`, LogLevel.Debug);
                this.log(`[scout] process options:\n${JSON.stringify(this.processOptions)}`, LogLevel.Debug);
                return this.agent.start();
            })
            .then(() => this.log("[scout] agent successfully started", LogLevel.Debug))
            .then(() => this.agent);
    }

    /**
     * Create an async namespace internally for use with tracking if not already present
     */
    private createAsyncNamespace() {
        const implementation = this.canUseAsyncHooks ? nrc : cls;
        this.asyncNamespace = implementation.getNamespace(ASYNC_NS);

        // Create if it doesn't exist
        if (!this.asyncNamespace) {
            this.asyncNamespace = implementation.createNamespace(ASYNC_NS);
        }
    }

    /**
     * Perform some action within a context
     *
     */
    private withAsyncRequestContext(cb: DoneCallback): Promise<any> {
        // If we can use async hooks then node-request-context is usable
        return new Promise((resolve) => {
            let result;
            let request: ScoutRequest;
            let ranCb = false;

            const doneFn = () => {
                this.log(`[scout] Finishing and sending request with ID [${request.id}]`, LogLevel.Debug);
                return request
                    .finishAndSend()
                    .then(() => this.clearAsyncNamespaceEntry(ASYNC_NS_REQUEST));
            };

            // Run in the async namespace
            this.asyncNamespace.run(() => {
                this.log(`[scout] Starting request in async namespace...`, LogLevel.Debug);

                // Star the request
                this.startRequest()
                    .then(r => request = r)
                // Update async namespace, run function
                    .then(() => {
                        this.log(`[scout] Request started w/ ID [${request.id}]`, LogLevel.Debug);
                        this.asyncNamespace.set(ASYNC_NS_REQUEST, request);

                        ranCb = true;
                        result = cb(doneFn, {request});

                        // Ensure that the result is a promise
                        resolve(result);
                    })
                // If an error occurs then run the fn and log
                    .catch(err => {
                        // In the case that an error occurs before the request gets made we can't run doneFn
                        if (!ranCb) { result = request ? cb(doneFn, {request}) : cb(() => undefined, {request}); }
                        resolve(result);
                        this.log(`[scout] failed to send start request: ${err}`, LogLevel.Error);
                    });
            });
        });
    }

    /**
     * Start a scout request and return a promise which resolves to the started request
     *
     * @param {ScoutRequestOptions} [options]
     * @returns {Promise<ScoutRequest>} a new scout request
     */
    private startRequest(opts?: ScoutRequestOptions): Promise<ScoutRequest> {
        return new Promise((resolve) => resolve(this.startRequestSync(opts)));
    }

    /**
     * Start a scout request synchronously
     *
     * @param {ScoutRequestOptions} [options]
     * @returns {ScoutRequest} a new scout request
     */
    private startRequestSync(opts?: ScoutRequestOptions): ScoutRequest {
        const request = new ScoutRequest(Object.assign({}, {scoutInstance: this}, opts || {}));
        return request.startSync();
    }

    private buildAppMetadataEvent(): Requests.V1ApplicationEvent {
        return new Requests.V1ApplicationEvent(
            `Pid: ${process.pid}`,
            ApplicationEventType.ScoutMetadata,
            this.applicationMetadata.serialize(),
            {timestamp: new Date()},
        );
    }

    // Helper for sending app metadata
    private sendAppMetadataEvent(): Promise<void> {
        return sendThroughAgent(this, this.buildAppMetadataEvent())
            .then(() => undefined)
            .catch(err => {
                this.log("[scout] failed to send start request request", LogLevel.Error);
            });
    }

    // Send the app registration request to the current agent
    private sendRegistrationRequest(): Promise<void> {
        return sendThroughAgent(this, new Requests.V1Register(
                this.config.name || "",
                this.config.key || "",
                APIVersion.V1,
            ))
            .then(() => undefined)
            .catch(err => {
                this.log("[scout] failed to send app registration request", LogLevel.Error);
            });
    }

    // Helper function for setting up an agent to be part of the scout instance
    private setupAgent(agent: ExternalProcessAgent): Promise<ExternalProcessAgent> {
        this.agent = agent;

        // Setup forwarding of all events of the agent through the scout instance
        Object.values(AgentEvent).forEach(evt => {
            this.agent.on(evt, msg => this.emit(evt, msg));
        });

        return Promise.resolve(this.agent);
    }

    private onUncaughtExceptionListener(err: Error) {
        // Get the current request if available
        const currentRequest = this.getCurrentRequest();
        if (!currentRequest) { return; }

        // Mark the curernt request as errored
        currentRequest.addContext({ name: ScoutContextName.Error, value: "true"});
    }

}

// The functions below are exports for module-level use. They need to be made externally available for
// code in this module but *not* as part of the public API for a Scout instance.

/**
 * Send the StartRequest message to the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutRequest} req - The original request
 * @returns {Promise<ScoutRequest>} the passed in request
 */
export function sendStartRequest(scout: Scout, req: ScoutRequest): Promise<ScoutRequest> {
    const startReq = new Requests.V1StartRequest({
        requestId: req.id,
        timestamp: req.getTimestamp(),
    });

    return sendThroughAgent(scout, startReq)
        .then(() => req)
        .catch(err => {
            scout.log(`[scout] failed to send start request request: ${err}`, LogLevel.Error);
            return req;
        });
}

/**
 * Send the StopRequest message to the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutRequest} req - The original request
 * @returns {Promise<ScoutRequest>} the passed in request
 */
export function sendStopRequest(scout: Scout, req: ScoutRequest): Promise<ScoutRequest> {
    const stopReq = new Requests.V1FinishRequest(req.id);

    return sendThroughAgent(scout, stopReq)
        .then(() => {
            scout.emit(ScoutEvent.RequestSent, {request: req} as ScoutEventRequestSentData);

            return req;
        })
        .catch(err => {
            scout.log("[scout] failed to send stop request request", LogLevel.Error);
            return req;
        });
}

/**
 * Send the TagRequest message to the agent for a single tag
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutRequest} req - The original request
 * @param {String} name - The tag name
 * @param {String} value - The tag value
 * @returns {Promise<void>} A promise which resolves when the message has been sent
 */
export function sendTagRequest(
    scout: Scout,
    req: ScoutRequest,
    name: string,
    value: JSONValue | JSONValue[],
): Promise<void> {
    const tagReq = new Requests.V1TagRequest(name, value, req.id);

    return sendThroughAgent(scout, tagReq)
        .then(() => undefined)
        .catch(err => {
            scout.log("[scout] failed to send tag request", LogLevel.Error);
        });
}

/**
 * Send the StartSpan message to the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutSpan} span - The original span
 * @returns {Promise<ScoutSpan>} the passed in span
 */
export function sendStartSpan(scout: Scout, span: ScoutSpan): Promise<ScoutSpan> {
    const opts = {
        spanId: span.id,
        parentId: span.parent ? span.parent.id : undefined,
        timestamp: span.getTimestamp(),
    };

    const startSpanReq = new Requests.V1StartSpan(
        span.operation,
        span.request.id,
        opts,
    );

    return sendThroughAgent(scout, startSpanReq)
        .then(() => span)
        .catch(err => {
            scout.log("[scout] failed to send start span request", LogLevel.Error);
            return span;
        });
}

/**
 * Send the TagSpan message to the agent message to the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutSpan} span - The original span
 * @param {String} name - The tag name
 * @param {String} value - The tag value
 * @returns {Promise<void>} A promise which resolves when the message has been
 */
export function sendTagSpan(
    scout: Scout,
    span: ScoutSpan,
    name: string,
    value: JSONValue | JSONValue[],
): Promise<void> {
    const tagSpanReq = new Requests.V1TagSpan(
        name,
        value,
        span.id,
        span.request.id,
    );

    return sendThroughAgent(scout, tagSpanReq)
        .then(() => undefined)
        .catch(err => {
            scout.log("[scout] failed to send tag span request", LogLevel.Error);
            return undefined;
        });
}

/**
 * Send the StopSpan message to the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutSpan} span - The original span
 * @returns {Promise<ScoutSpan>} the passed in request
 */
export function sendStopSpan(scout: Scout, span: ScoutSpan): Promise<ScoutSpan> {
    const stopSpanReq = new Requests.V1StopSpan(span.id, span.request.id);

    return sendThroughAgent(scout, stopSpanReq)
        .then(() => span)
        .catch(err => {
            scout.log("[scout] failed to send stop span request", LogLevel.Error);
            return span;
        });
}

/**
 * Helper function for sending a given request through the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {T extends BaseAgentRequest} msg - The message to send
 * @returns {Promise<T extends BaseAgentResponse>} resp - The message to send
 */
export function sendThroughAgent<T extends BaseAgentRequest, R extends BaseAgentResponse>(
    scout: Scout,
    msg: T,
    opts?: {async: boolean},
): Promise<R | void> {
    if (!scout.hasAgent()) {
        const err = new Errors.Disconnected("No agent is present, please run .setup()");
        scout.log(err.message, LogLevel.Error);
        return Promise.reject(err);
    }

    const agent = scout.getAgent();
    const config = scout.getConfig();

    if (!config.monitor) {
        scout.log("[scout] monitoring disabled, not sending tag request", LogLevel.Warn);
        return Promise.reject(new Errors.MonitoringDisabled());
    }

    if (opts && opts.async) {
        return agent.sendAsync(msg);
    }

    return agent.send(msg) as Promise<void | R>;
}
