import * as path from "path";
import * as process from "process";
import { v4 as uuidv4 } from "uuid";

import {
    APIVersion,
    Agent,
    AgentDownloadOptions,
    AgentDownloader,
    ApplicationMetadata,
    CoreAgentVersion,
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

interface Taggable {
    addTags(tags: ScoutTag[]): Promise<this>;
}

interface Stoppable {
    stop(): Promise<this>;

    isStopped(): boolean;
}

export interface ScoutTag {
    name: string;
    value: string;
}

export interface ScoutRequestOptions {
    logFn?: LogFn;
    scoutInstance?: Scout;
    timestamp?: Date;
}

export class ScoutRequest implements ChildSpannable, Taggable, Stoppable {
    public readonly id: string;
    public readonly timestamp: Date;

    private readonly scoutInstance?: Scout;
    private logFn: LogFn = () => undefined;
    private finished: boolean = false;
    private sent: boolean = false;

    private childSpans: ScoutSpan[] = [];
    private tags: { [key: string]: string } = {};

    constructor(id: string, opts?: ScoutRequestOptions) {
        this.id = id;
        this.timestamp = opts && opts.timestamp ? opts.timestamp : new Date();

        if (opts) {
            if (opts.logFn) { this.logFn = opts.logFn; }
            if (opts.scoutInstance) { this.scoutInstance = opts.scoutInstance; }
        }
    }

    public span(operation: string): Promise<ScoutSpan> {
        return this.startChildSpan(operation);
    }

    /** @see ChildSpannable */
    public startChildSpan(operation: string): Promise<ScoutSpan> {
        if (this.finished) {
            this.logFn(`[scout/request/${this.id}] Cannot add a child span to a finished request [${this.id}]`, LogLevel.Error);

            return Promise.reject(new Errors.FinishedRequest(
                "Cannot add a child span to a finished request",
            ));
        }

        // Create a new child span
        const span = new ScoutSpan(operation, uuidv4(), this, {scoutInstance: this.scoutInstance, logFn: this.logFn});
        this.childSpans.push(span);

        return Promise.resolve(span);
    }

    /** @see ChildSpannable */
    public getChildSpans(): Promise<ScoutSpan[]> {
        return Promise.resolve(this.childSpans);
    }

    /** @see Taggable */
    public addTags(tags: ScoutTag[]): Promise<this> {
        tags.forEach(t => this.tags[t.name] = t.value);
        return Promise.resolve(this);
    }

    public finish(): Promise<this> {
        return this.stop();
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

        // Start request
        return inst.startRequest(this)
        // Send all the child spans
            .then(() => Promise.all(
                this.childSpans.map(s => s.send()),
            ))
        // Send tags
            .then(() => Promise.all(
                Object.entries(this.tags).map(([name, value]) => inst.tagRequest(this, name, value)),
            ))
        // End the span
            .then(() => inst.stopRequest(this))
            .then(() => this.sent = true)
            .then(() => this)
            .catch(err => {
                this.logFn(`[scout/request/${this.id}]Failed to send request`);
                return this;
            });
    }
}

export interface ScoutSpanOptions {
    scoutInstance?: Scout;
    logFn?: LogFn;
    parent?: ScoutSpan;
    timestamp?: Date;
}

export class ScoutSpan implements ChildSpannable, Taggable, Stoppable {
    public readonly request: ScoutRequest;
    public readonly parent?: ScoutSpan;
    public readonly id: string;
    public readonly timestamp: Date;
    public readonly operation: string;

    private readonly scoutInstance?: Scout;
    private logFn: LogFn = () => undefined;

    private stopped: boolean = false;
    private sent: boolean = false;
    private childSpans: ScoutSpan[] = [];
    private tags: { [key: string]: string } = {};

    constructor(operation: string, id: string, req: ScoutRequest, opts?: ScoutSpanOptions) {
        this.request = req;
        this.id = id;
        this.timestamp = opts && opts.timestamp ? opts.timestamp : new Date();
        this.operation = operation;

        if (opts) {
            if (opts.logFn) { this.logFn = opts.logFn; }
            if (opts.scoutInstance) { this.scoutInstance = opts.scoutInstance; }
        }
    }

    /** @see Taggable */
    public addTags(tags: ScoutTag[]): Promise<this> {
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

        const span = new ScoutSpan(
            operation,
            uuidv4(),
            this.request,
            {scoutInstance: this.scoutInstance, logFn: this.logFn, parent: this},
        );

        this.childSpans.push(span);

        return Promise.resolve(span);
    }

    /** @see ChildSpannable */
    public getChildSpans(): Promise<ScoutSpan[]> {
        return Promise.resolve(this.childSpans);
    }

    public finish(): Promise<this> {
        return this.stop();
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
        return inst.startSpan(this.operation, this.request, this.parent)
        // Send all the child spans
            .then(() => Promise.all(
                this.childSpans.map(s => s.send()),
            ))
        // Send tags
            .then(() => Promise.all(
                Object.entries(this.tags).map(([name, value]) => inst.tagSpan(this, name, value)),
            ))
        // End the span
            .then(() => inst.stopSpan(this))
            .then(() => this.sent = true)
            .then(() => this)
            .catch(err => {
                this.logFn(`[scout/request/${this.request.id}/span/${this.id}}] Failed to send span`);
                return this;
            });
    }
}

export interface ScoutOptions {
    logFn?: LogFn;
    downloadOptions?: Partial<AgentDownloadOptions>;
    appMeta?: ApplicationMetadata;
}

export class Scout {
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

                this.agent = new ExternalProcessAgent(this.processOptions, this.logFn);
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

                return this.agent.send(new Requests.V1Register(
                    this.config.name || "",
                    this.config.key || "",
                    APIVersion.V1,
                ));
            })
        // Send the application metadata
            .then(() => this.agent.send(this.buildAppMetadataEvent()))
            .then(() => this);
    }

    public startRequest(original?: ScoutRequest): Promise<ScoutRequest> {
        if (!this.hasAgent()) {
            const err = new Errors.Disconnected("No agent is present, please run .setup()");
            this.logFn(err.message, LogLevel.Error);
            return Promise.reject(err);
        }

        let req: Requests.V1StartRequest;
        if (original) {
            req = new Requests.V1StartRequest({
                requestId: original.id,
                timestamp: original.timestamp,
            });
        } else {
            req = new Requests.V1StartRequest();
        }

        return this.agent
            .send(req)
            .then(() => {
                if (original) { return original; }
                return new ScoutRequest(req.requestId, {scoutInstance: this});
            });
    }

    public stopRequest(req: ScoutRequest): Promise<ScoutRequest> {
        if (!this.hasAgent()) {
            const err = new Errors.Disconnected("No agent is present, please run .setup()");
            this.logFn(err.message, LogLevel.Error);
            return Promise.reject(err);
        }

        return this.agent
            .send(new Requests.V1FinishRequest(req.id))
            .then(() => req);
    }

    public tagRequest(req: ScoutRequest, name: string, value: string): Promise<void> {
        if (!this.hasAgent()) {
            const err = new Errors.Disconnected("No agent is present, please run .setup()");
            this.logFn(err.message, LogLevel.Error);
            return Promise.reject(err);
        }

        return this.agent
            .send(new Requests.V1TagRequest(
                name,
                value,
                req.id,
            ))
            .then(() => undefined);
    }

    public tagSpan(span: ScoutSpan, name: string, value: string): Promise<void> {
        if (!this.hasAgent()) {
            const err = new Errors.Disconnected("No agent is present, please run .setup()");
            this.logFn(err.message, LogLevel.Error);
            return Promise.reject(err);
        }

        return this.agent
            .send(new Requests.V1TagSpan(
                name,
                value,
                span.id,
                span.request.id,
            ))
            .then(() => undefined);
    }

    public startSpan(operation: string, req: ScoutRequest, parent?: ScoutSpan): Promise<ScoutSpan> {
        if (!this.hasAgent()) {
            const err = new Errors.Disconnected("No agent is present, please run .setup()");
            this.logFn(err.message, LogLevel.Error);
            return Promise.reject(err);
        }

        const opts = {
            parentId: parent ? parent.id : undefined,
        };

        const startSpan = new Requests.V1StartSpan(operation, req.id);
        return this.agent
            .send(startSpan)
            .then(() => new ScoutSpan(operation, startSpan.spanId, req, {scoutInstance: this}));
    }

    public stopSpan(span: ScoutSpan): Promise<ScoutSpan> {
        if (!this.hasAgent()) {
            const err = new Errors.Disconnected("No agent is present, please run .setup()");
            this.logFn(err.message, LogLevel.Error);
            return Promise.reject(err);
        }

        return this.agent
            .send(new Requests.V1StopSpan(span.id, span.request.id))
            .then(() => span);
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
            this.applicationMetadata,
            {timestamp: new Date()},
        );
    }

}
