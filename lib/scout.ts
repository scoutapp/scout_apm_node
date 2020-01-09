import { EventEmitter } from "events";
import * as path from "path";
import * as process from "process";
import { v4 as uuidv4 } from "uuid";

import {
    APIVersion,
    Agent,
    AgentEvent,
    AgentDownloadOptions,
    AgentDownloader,
    ApplicationMetadata,
    CoreAgentVersion,
    BaseAgentRequest,
    BaseAgentResponse,
    LogFn,
    LogLevel,
    ProcessOptions,
    ScoutConfiguration,
    buildDownloadOptions,
    buildProcessOptions,
    buildScoutConfiguration,
} from "./types";
import WebAgentDownloader from "./agent-downloaders/web";
import ExternalProcessAgent from "./agents/external-process";
import * as Requests from "./protocol/v1/requests";
import * as Constants from "./constants";
import * as Errors from "./errors";

// A class that represents objects that can have/contain child spans
interface ChildSpannable {
    /**
     * Create a child span inside the request
     * @abstract
     */
    startChildSpan(operation: string): Promise<ScoutSpan>;

    /**
     * Get all active child spans
     */
    getChildSpans(): Promise<ScoutSpan[]>;
}

interface HasContext {
    addContext(tags: ScoutTag[]): Promise<this>;
}

interface Stoppable {
    stop(): Promise<this>;

    isStopped(): boolean;
}

interface Startable {
    start(): Promise<this>;

    isStarted(): boolean;
}

export interface ScoutTag {
    name: string;
    value: string;
}

export interface ScoutRequestOptions {
    id?: string;
    logFn?: LogFn;
    scoutInstance?: Scout;
    timestamp?: Date;
    started?: boolean;
}

export class ScoutRequest implements ChildSpannable, HasContext, Stoppable, Startable {
    public readonly id: string;

    private timestamp: Date;

    private readonly scoutInstance?: Scout;

    private started: boolean = false;
    private finished: boolean = false;
    private sent: boolean = false;

    private childSpans: ScoutSpan[] = [];
    private tags: { [key: string]: string } = {};

    constructor(opts?: ScoutRequestOptions) {
        this.id = opts && opts.id ? opts.id : `${Constants.DEFAULT_REQUEST_PREFIX}${uuidv4()}`;

        if (opts) {
            if (opts.logFn) { this.logFn = opts.logFn; }
            if (opts.scoutInstance) { this.scoutInstance = opts.scoutInstance; }
            if (opts.timestamp)  { this.timestamp = opts.timestamp; }

            // It's possible that the scout request has already been started
            // ex. when startRequest is used by a Scout instance
            if (opts.started) { this.started = opts.started; }
        }
    }

    public span(operation: string): Promise<ScoutSpan> {
        return this.startChildSpan(operation);
    }

    public getTimestamp(): Date {
        return new Date(this.timestamp);
    }

    /** @see ChildSpannable */
    public startChildSpan(operation: string): Promise<ScoutSpan> {
        if (this.finished) {
            this.logFn(
                `[scout/request/${this.id}] Cannot add a child span to a finished request [${this.id}]`,
                LogLevel.Error,
            );

            return Promise.reject(new Errors.FinishedRequest(
                "Cannot add a child span to a finished request",
            ));
        }

        // Create a new child span
        const span = new ScoutSpan({
            operation,
            request: this,
            scoutInstance: this.scoutInstance,
            logFn: this.logFn,
        });

        // Add the child span to the list
        this.childSpans.push(span);

        return span.start();
    }

    /** @see ChildSpannable */
    public getChildSpans(): Promise<ScoutSpan[]> {
        return Promise.resolve(this.childSpans);
    }

    /** @see HasContext */
    public addContext(tags: ScoutTag[]): Promise<this> {
        tags.forEach(t => this.tags[t.name] = t.value);
        return Promise.resolve(this);
    }

    public finish(): Promise<this> {
        return this.stop();
    }

    public finishAndSend(): Promise<this> {
        return this.finish()
            .then(() => this.send());
    }

    public isStopped(): boolean {
        return this.finished;
    }

    public stop(): Promise<this> {
        if (this.finished) { return Promise.resolve(this); }

        // Stop all child spans
        this.childSpans.forEach(s => s.stop());

        // Finish the request
        this.finished = true;

        return Promise.resolve(this);
    }

    public isStarted(): boolean {
        return this.started;
    }

    public start(): Promise<this> {
        if (this.started) { return Promise.resolve(this); }

        this.timestamp = new Date();
        this.started = true;

        return Promise.resolve(this);
    }

    /**
     * Send this request and internal spans to the scoutInstance
     *
     * @returns this request
     */
    public send(scoutInstance?: Scout): Promise<this> {
        const inst = scoutInstance || this.scoutInstance;

        // Ensure a scout instance was available
        if (!inst) {
            this.logFn(`[scout/request/${this.id}] No scout instance available, send failed`);
            return Promise.resolve(this);
        }

        return inst.sendStartRequest(this)
        // Send all the child spans
            .then(() => Promise.all(this.childSpans.map(s => s.send())))
        // Send tags
            .then(() => Promise.all(
                Object.entries(this.tags).map(([name, value]) => inst.sendTagRequest(this, name, value)),
            ))
        // End the span
            .then(() => inst.sendStopRequest(this))
            .then(() => this.sent = true)
            .then(() => this)
            .catch(err => {
                this.logFn(`[scout/request/${this.id}]Failed to send request`);
                return this;
            });
    }

    private logFn: LogFn = () => undefined;
}

export interface ScoutSpanOptions {
    id?: string;
    scoutInstance?: Scout;
    logFn?: LogFn;
    parent?: ScoutSpan;
    timestamp?: Date;
    started?: boolean;
    operation: string;
    request: ScoutRequest;
}

export class ScoutSpan implements ChildSpannable, HasContext, Stoppable, Startable {
    public readonly request: ScoutRequest;
    public readonly parent?: ScoutSpan;
    public readonly id: string;
    public readonly operation: string;

    private timestamp: Date;
    private readonly scoutInstance?: Scout;

    private started: boolean = false;
    private stopped: boolean = false;
    private sent: boolean = false;
    private childSpans: ScoutSpan[] = [];
    private tags: { [key: string]: string } = {};

    constructor(opts: ScoutSpanOptions) {
        this.request = opts.request;
        this.id = opts && opts.id ? opts.id : `${Constants.DEFAULT_SPAN_PREFIX}${uuidv4()}`;
        this.operation = opts.operation;

        if (opts) {
            if (opts.logFn) { this.logFn = opts.logFn; }
            if (opts.scoutInstance) { this.scoutInstance = opts.scoutInstance; }
            if (opts.timestamp)  { this.timestamp = opts.timestamp; }

            // It's possible that the scout span has already been started
            // ex. when startSpan is used by a Scout instance
            if (opts.started) { this.started = opts.started; }
        }
    }

    public getTimestamp(): Date {
        return new Date(this.timestamp);
    }

    /** @see HasContext */
    public addContext(tags: ScoutTag[]): Promise<this> {
        tags.forEach(t => this.tags[t.name] = t.value);
        return Promise.resolve(this);
    }

    /** @see ChildSpannable */
    public startChildSpan(operation: string): Promise<ScoutSpan> {
        if (this.stopped) {
            this.logFn(
                `[scout/request/${this.request.id}/span/${this.id}] Cannot add span to stopped span [${this.id}]`,
                LogLevel.Error,
            );

            return Promise.reject(new Errors.FinishedRequest(
                "Cannot add a child span to a finished span",
            ));
        }

        const span = new ScoutSpan({
            operation,
            request: this.request,
            scoutInstance: this.scoutInstance,
            logFn: this.logFn,
            parent: this,
        });

        this.childSpans.push(span);

        return span.start();
    }

    /** @see ChildSpannable */
    public getChildSpans(): Promise<ScoutSpan[]> {
        return Promise.resolve(this.childSpans);
    }

    public finish(): Promise<this> {
        return this.stop();
    }

    public finishAndSend(): Promise<this> {
        return this.finish()
            .then(() => this.send());
    }

    public isStopped(): boolean {
        return this.stopped;
    }

    public stop(): Promise<this> {
        if (this.stopped) { return Promise.resolve(this); }

        this.stopped = true;

        // Stop all child spans
        this.childSpans.forEach(s => s.stop());

        return Promise.resolve(this);
    }

    public isStarted(): boolean {
        return this.started;
    }

    public start(): Promise<this> {
        if (this.started) { return Promise.resolve(this); }

        this.timestamp = new Date();
        this.started = true;

        return Promise.resolve(this);
    }

    /**
     * Send this span and internal spans to the scoutInstance
     *
     * @returns this span
     */
    public send(scoutInstance?: Scout): Promise<this> {
        const inst = scoutInstance || this.scoutInstance;

        // Ensure a scout instance was available
        if (!inst) {
            this.logFn(`[scout/request/${this.id}] No scout instance available, send failed`);
            return Promise.resolve(this);
        }

        // Start Span
        return inst.sendStartSpan(this)
        // Send all the child spans
            .then(() => Promise.all(this.childSpans.map(s => s.send())))
        // Send tags
            .then(() => Promise.all(
                Object.entries(this.tags).map(([name, value]) => inst.sendTagSpan(this, name, value)),
            ))
        // End the span
            .then(() => inst.sendStopSpan(this))
            .then(() => this.sent = true)
            .then(() => this)
            .catch(err => {
                this.logFn(`[scout/request/${this.request.id}/span/${this.id}}] Failed to send span`);
                return this;
            });
    }

    private logFn: LogFn = () => undefined;
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
    }

    public getCoreAgentVersion(): CoreAgentVersion {
        return new CoreAgentVersion(this.coreAgentVersion.raw);
    }

    public getApplicationMetadata(): ApplicationMetadata {
        return Object.assign({}, this.applicationMetadata);
    }

    public setup(): Promise<this> {
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
            .then(() => this);
    }

    /**
     * Helper function for starting a scout request with the instance
     *
     * @param {ScoutRequestOptions} [options]
     * @returns {Promise<ScoutRequest>} a new scout request
     */
    public startRequest(opts?: ScoutRequestOptions): Promise<ScoutRequest> {
        const request = new ScoutRequest(Object.assign({}, {scoutInstance: this}, opts || {}));
        return request.start();
    }

    /**
     * Send the StartRequest message to the agent
     *
     * @param {ScoutRequest} req - The original request
     * @returns {Promise<ScoutRequest>} the passed in request
     */
    public sendStartRequest(req: ScoutRequest): Promise<ScoutRequest> {
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
    public sendStopRequest(req: ScoutRequest): Promise<ScoutRequest> {
        const stopReq = new Requests.V1FinishRequest(req.id);

        return this
            .sendThroughAgent(stopReq)
            .then(() => req)
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
    public sendTagRequest(req: ScoutRequest, name: string, value: string): Promise<void> {
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
    public sendStartSpan(span: ScoutSpan): Promise<ScoutSpan> {
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
     * @returns {Promise<void>} A promise which resolves when the message has been sent
     */
    public sendTagSpan(span: ScoutSpan, name: string, value: string): Promise<void> {
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
    public sendStopSpan(span: ScoutSpan): Promise<ScoutSpan> {
        const stopSpanReq = new Requests.V1StopSpan(span.id, span.request.id);

        return this
            .sendThroughAgent(stopSpanReq)
            .then(() => span)
            .catch(err => {
                this.logFn("[scout] failed to send stop span request", LogLevel.Error);
                return span;
            });
    }

    public shutdown(): Promise<void> {
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
