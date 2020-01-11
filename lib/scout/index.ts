import { EventEmitter } from "events";
import * as path from "path";
import * as process from "process";
import { v4 as uuidv4 } from "uuid";
import * as nrc from "node-request-context";
import * as cls from "continuation-local-storage";
import { Namespace } from "node-request-context";
import * as semver from "semver";

import {
    APIVersion,
    Agent,
    AgentDownloadOptions,
    AgentDownloader,
    AgentEvent,
    ApplicationMetadata,
    BaseAgentRequest,
    BaseAgentResponse,
    CoreAgentVersion,
    LogFn,
    LogLevel,
    ProcessOptions,
    ScoutConfiguration,
    ScoutEvent,
    URIReportingLevel,
    buildDownloadOptions,
    buildProcessOptions,
    buildScoutConfiguration,
    scrubRequestPathParams,
    scrubRequestPath,
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
}

export class Scout extends EventEmitter {
    private readonly config: Partial<ScoutConfiguration>;

    private downloader: AgentDownloader;
    private downloaderOptions: AgentDownloadOptions = {};
    private binPath: string;
    private socketPath: string;
    private logFn: LogFn;

    private coreAgentVersion: CoreAgentVersion;
    private agent: ExternalProcessAgent;
    private processOptions: ProcessOptions;
    private applicationMetadata: ApplicationMetadata;
    private canUseAsyncHooks: boolean = false;

    private asyncNamespace: any;

    constructor(config?: Partial<ScoutConfiguration>, opts?: ScoutOptions) {
        super();

        this.config = config || buildScoutConfiguration();
        this.logFn = opts && opts.logFn ? opts.logFn : () => undefined;

        if (opts && opts.downloadOptions) {
            this.downloaderOptions = opts.downloadOptions;
        }

        this.applicationMetadata = new ApplicationMetadata(
            this.config,
            opts && opts.appMeta ? opts.appMeta : {},
        );

        // Check node version for before/after
        this.canUseAsyncHooks = semver.gte(process.version, "8.9.0");

        // Create async namespace
        this.asyncNamespace = this.canUseAsyncHooks ? nrc.createNamespace("scout") : cls.createNamespace("scout");
    }

    public getCoreAgentVersion(): CoreAgentVersion {
        return new CoreAgentVersion(this.coreAgentVersion.raw);
    }

    public getApplicationMetadata(): ApplicationMetadata {
        return Object.assign({}, this.applicationMetadata);
    }

    public setup(): Promise<this> {
        // Return early if agent has already been set up
        if (this.agent) { return Promise.resolve(this); }

        this.downloader = new WebAgentDownloader({logFn: this.logFn});

        // Ensure coreAgentVersion is present
        if (!this.config.coreAgentVersion) {
            const err = new Error("No core agent version specified!");
            this.logFn(err.message, LogLevel.Error);
            return Promise.reject(err);
        }

        this.coreAgentVersion = new CoreAgentVersion(this.config.coreAgentVersion);

        // Build options for download
        this.downloaderOptions = Object.assign(
            {
                cacheDir: Constants.DEFAULT_CORE_AGENT_DOWNLOAD_CACHE_DIR,
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
                this.socketPath = path.join(
                    path.dirname(this.binPath),
                    "core-agent.sock",
                );
                this.logFn(`[scout] using socket path [${this.socketPath}]`, LogLevel.Debug);
            })
        // Build options for the agent and create the agent
            .then(() => {
                this.processOptions = new ProcessOptions(
                    this.binPath,
                    this.getSocketPath(),
                    buildProcessOptions(this.config),
                );

                this.setupAgent(new ExternalProcessAgent(this.processOptions, this.logFn));
            })
        // Start, connect, and register
            .then(() => {
                this.logFn(`[scout] starting process w/ bin @ path [${this.binPath}]`, LogLevel.Debug);
                this.logFn(`[scout] process options:\n${JSON.stringify(this.processOptions)}`, LogLevel.Debug);
                return this.agent.start();
            })
            .then(() => this.logFn("[scout] agent successfully started", LogLevel.Debug))
            .then(() => this.agent.connect())
            .then(() => this.logFn("[scout] successfully connected to agent", LogLevel.Debug))
            .then(() => {
                if (!this.config.name) {
                    this.logFn("[scout] 'name' configuration value missing", LogLevel.Warn);
                }
                if (!this.config.key) {
                    this.logFn("[scout] 'key' missing in configuration", LogLevel.Warn);
                }
            })
        // Register the application
            .then(() => this.sendRegistrationRequest())
        // Send the application metadata
            .then(() => this.sendAppMetadataEvent())
        // Set up integration(s)
            .then(() => {
                Object.keys(EXPORT_BAG)
                    .map(packageName => getIntegrationForPackage(packageName))
                    .forEach(integration => integration.setScoutInstance(this));
            })
            .then(() => this);
    }

    public shutdown(): Promise<void> {
        if (!this.agent) {
            this.logFn("[scout] shutdown called but no agent to shutdown is present", LogLevel.Error);
            return Promise.reject(new Errors.NoAgentPresent());
        }

        return this.agent
            .disconnect()
            .then(() => {
                if (this.config.allowShutdown) {
                    return this.agent.stopProcess();
                }
            });
    }

    public hasAgent(): boolean {
        return this.agent !== null;
    }

    public getAgent(): ExternalProcessAgent {
        return this.agent;
    }

    /**
     * Function for checking whether a given path (URL) is ignored by scout
     *
     * @param {string} path - processed path (ex. "/api/v1/echo/:name")
     * @returns {boolean} whether the path should be ignored
     */
    public ignoresPath(path: string): boolean {
        this.logFn("[scout] checking path [${path}] against ignored paths", LogLevel.Trace);

        // If ignore isn't specified or if empty, then nothing is ignored
        if (!this.config.ignore || this.config.ignore.length === 0) {
            return false;
        }

        const matchingPrefix = this.config.ignore.find(prefix => path.indexOf(prefix) === 0);

        if (matchingPrefix) {
            this.logFn("[scout] ignoring path [${path}] matching prefix [${matchingPrefix}]", LogLevel.Debug);
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
     * @returns void
     */
    public transaction(name: string, cb: () => any): Promise<any> {
        return this.withAsyncRequestContext(cb);
    }

    /**
     * Start an insrumentation, withing a given transaction
     *
     * @param {string} operation
     * @param {Function} cb
     * @returns {Promise<any>} a promsie that resolves to the result of the callback
     */
    public instrument(operation: string, cb: () => any): Promise<any> {
        const parent = this.getCurrentSpan() || this.getCurrentRequest();
        // If no request is currently underway
        if (!parent) {
            this.logFn(
                "[scout] Failed to start instrumentation, no current transaction/parent instrumentation",
                LogLevel.Error,
            );
            return Promise.resolve(cb());
        }

        let result;
        let ranCb = false;

        return parent
        // Start the child span
            .startChildSpan(operation)
        // Set up the async namespace, run the function
            .then(span => {
                this.asyncNamespace.set("scout.span", span);
                result = cb();
                ranCb = true;
                return span;
            })
        // Stop the span if it hasn't been stopped already
            .then(span => span.stop())
        // Update the async namespace
            .then(() => {
                this.asyncNamespace.set("scout.span", null);
                return result;
            })
            .catch(err => {
                if (!ranCb) { result = cb(); }
                this.logFn("[scout] failed to send start span", LogLevel.Error);
                return result;
            });
    }

    /**
     * Reterieve the current request using the async hook/continuation local storage machinery
     *
     * @returns {ScoutRequest} the current active request
     */
    public getCurrentRequest(): ScoutRequest | null {
        return this.asyncNamespace.get("scout.request");
    }

    /**
     * Reterieve the current span using the async hook/continuation local storage machinery
     *
     * @returns {ScoutSpan} the current active span
     */
    public getCurrentSpan(): ScoutSpan | null {
        return this.asyncNamespace.get("scout.span");
    }

    /**
     * Perform some action within a context
     *
     */
    private withAsyncRequestContext(cb: () => any): Promise<any> {
        // If we can use async hooks then node-request-context is usable
        return new Promise((resolve) => {
            let result;
            let req: ScoutRequest;
            let ranCb = false;

            this.asyncNamespace.run(() => {
                this.startRequest()
                    .then(req => {
                        this.asyncNamespace.set("scout.request", req);
                        result = cb();
                        ranCb = true;
                    })
                    .then(() => req.stop())
                    .then(() => {
                        this.asyncNamespace.set("scout.request", null);
                        return result;
                    })
                    .catch(err => {
                        if (!ranCb) { result = cb(); }
                        resolve(result);
                        this.logFn("[scout] failed to send start request request", LogLevel.Error);
                    });
            });
        });
    }

    /**
     * Helper function for starting a scout request with the instance
     *
     * @param {ScoutRequestOptions} [options]
     * @returns {Promise<ScoutRequest>} a new scout request
     */
    private startRequest(opts?: ScoutRequestOptions): Promise<ScoutRequest> {
        const request = new ScoutRequest(Object.assign({}, {scoutInstance: this}, opts || {}));
        return request.start();
    }

    /**
     * Send the StartRequest message to the agent
     *
     * @param {ScoutRequest} req - The original request
     * @returns {Promise<ScoutRequest>} the passed in request
     */
    private sendStartRequest(req: ScoutRequest): Promise<ScoutRequest> {
        const startReq = new Requests.V1StartRequest({
            requestId: req.id,
            timestamp: req.getTimestamp(),
        });

        return this
            .sendThroughAgent(startReq)
            .then(() => req)
            .catch(err => {
                this.logFn("[scout] failed to send start request request", LogLevel.Error);
                return req;
            });
    }

    /**
     * Send the StopRequest message to the agent
     *
     * @param {ScoutRequest} req - The original request
     * @returns {Promise<ScoutRequest>} the passed in request
     */
    private sendStopRequest(req: ScoutRequest): Promise<ScoutRequest> {
        const stopReq = new Requests.V1FinishRequest(req.id);

        return this
            .sendThroughAgent(stopReq)
            .then(() => {
                this.emit(ScoutEvent.RequestSent, {request: req} as ScoutEventRequestSentData);

                return req;
            })
            .catch(err => {
                this.logFn("[scout] failed to send stop request request", LogLevel.Error);
                return req;
            });
    }

    /**
     * Send the TagRequest message to the agent for a single tag
     *
     * @param {ScoutRequest} req - The original request
     * @param {String} name - The tag name
     * @param {String} value - The tag value
     * @returns {Promise<void>} A promise which resolves when the message has been sent
     */
    private sendTagRequest(req: ScoutRequest, name: string, value: string): Promise<void> {
        const tagReq = new Requests.V1TagRequest(name, value, req.id);

        return this
            .sendThroughAgent(tagReq)
            .then(() => undefined)
            .catch(err => {
                this.logFn("[scout] failed to send tag request", LogLevel.Error);
            });
    }

    /**
     * Send the StartSpan message to the agent
     *
     * @param {ScoutSpan} span - The original span
     * @returns {Promise<ScoutSpan>} the passed in span
     */
    private sendStartSpan(span: ScoutSpan): Promise<ScoutSpan> {
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

        return this
            .sendThroughAgent(startSpanReq)
            .then(() => span)
            .catch(err => {
                this.logFn("[scout] failed to send start span request", LogLevel.Error);
                return span;
            });
    }

    /**
     * Send the TagSpan message to the agent message to the agent
     *
     * @param {ScoutSpan} span - The original span
     * @param {String} name - The tag name
     * @param {String} value - The tag value
     * @returns {Promise<void>} A promise which resolves when the message has been
     */
    private sendTagSpan(span: ScoutSpan, name: string, value: string): Promise<void> {
        const tagSpanReq = new Requests.V1TagSpan(
            name,
            value,
            span.id,
            span.request.id,
        );

        return this
            .sendThroughAgent(tagSpanReq)
            .then(() => undefined)
            .catch(err => {
                this.logFn("[scout] failed to send tag span request", LogLevel.Error);
                return undefined;
            });
    }

    /**
     * Send the StopSpan message to the agent
     *
     * @param {ScoutSpan} span - The original span
     * @returns {Promise<ScoutSpan>} the passed in request
     */
    private sendStopSpan(span: ScoutSpan): Promise<ScoutSpan> {
        const stopSpanReq = new Requests.V1StopSpan(span.id, span.request.id);

        return this
            .sendThroughAgent(stopSpanReq)
            .then(() => span)
            .catch(err => {
                this.logFn("[scout] failed to send stop span request", LogLevel.Error);
                return span;
            });
    }

    private getSocketPath() {
        return `unix://${this.socketPath}`;
    }

    private buildAppMetadataEvent(): Requests.V1ApplicationEvent {
        return new Requests.V1ApplicationEvent(
            `Pid: ${process.pid}`,
            "scout.metadata",
            this.applicationMetadata.serialize(),
            {timestamp: new Date()},
        );
    }

    // Helper for sending app metadata
    private sendAppMetadataEvent(): Promise<void> {
        return this
            .sendThroughAgent(this.buildAppMetadataEvent(), {async: true})
            .then(() => undefined)
            .catch(err => {
                this.logFn("[scout] failed to send start request request", LogLevel.Error);
            });
    }

    private sendRegistrationRequest(): Promise<void> {
        return this
            .sendThroughAgent(new Requests.V1Register(
                this.config.name || "",
                this.config.key || "",
                APIVersion.V1,
            ))
            .then(() => undefined)
            .catch(err => {
                this.logFn("[scout] failed to send app registration request", LogLevel.Error);
            });
    }

    /**
     * Helper function for sending a given request through the agent
     *
     * @param {T extends BaseAgentRequest} msg - The message to send
     * @returns {Promise<T extends BaseAgentResponse>} resp - The message to send
     */
    private sendThroughAgent<T extends BaseAgentRequest, R extends BaseAgentResponse>(
        msg: T,
        opts?: {async: boolean},
    ): Promise<R | void> {
        if (!this.hasAgent()) {
            const err = new Errors.Disconnected("No agent is present, please run .setup()");
            this.logFn(err.message, LogLevel.Error);
            return Promise.reject(err);
        }

        if (!this.config.monitor) {
            this.logFn("[scout] monitoring disabled, not sending tag request", LogLevel.Warn);
            return Promise.reject(new Errors.MonitoringDisabled());
        }

        if (opts && opts.async) {
            return this.agent.sendAsync(msg);
        }

        return this.agent.send(msg) as Promise<void | R>;
    }

    // Helper function for setting up an agent to be part of the scout instance
    private setupAgent(agent: ExternalProcessAgent): Promise<void> {
        this.agent = agent;

        // Setup forwarding of all events of the agent through the scout instance
        Object.values(AgentEvent).forEach(evt => {
            this.agent.on(evt, msg => this.emit(evt, msg));
        });

        return Promise.resolve();
    }

}
