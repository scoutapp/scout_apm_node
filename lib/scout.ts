import * as path from "path";
import * as process from "process";

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

export class ScoutRequest implements ChildSpannable, Taggable, Stoppable {
    public readonly id: string;

    private readonly scoutInstance: Scout;
    private finished: boolean = false;
    private childSpans: ScoutSpan[] = [];

    constructor(id: string, s: Scout) {
        this.scoutInstance = s;
        this.id = id;
    }

    public span(operation: string): Promise<ScoutSpan> {
        return this.startChildSpan(operation);
    }

    /** @see ChildSpannable */
    public startChildSpan(operation: string): Promise<ScoutSpan> {
        if (this.finished) {
            return Promise.reject(new Errors.FinishedRequest(
                "Cannot add a child span to a finished request",
            ));
        }

        return this.scoutInstance
            .startSpan(operation, this)
            .then(span => {
                this.childSpans.push(span);
                return span;
            });
    }

    /** @see ChildSpannable */
    public getChildSpans(): Promise<ScoutSpan[]> {
        return Promise.resolve(this.childSpans);
    }

    /** @see Taggable */
    public addTags(tags: ScoutTag[]): Promise<this> {
        // If tags is empty then return early
        if (!tags || tags.length === 0) { return Promise.resolve(this); }

        // Send all tags
        return Promise.all(tags.map(({name, value}) => this.scoutInstance.tagRequest(this, name, value)))
            .then(() => this);
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
        return Promise.all(this.childSpans.map(s => s.stop()))
        // Stop this span
            .then(() => this.scoutInstance.stopRequest(this))
            .then(() => this.finished = true)
            .then(() => this);
    }
}

export class ScoutSpan implements ChildSpannable, Taggable, Stoppable {
    public readonly request: ScoutRequest;
    public readonly id: string;
    public readonly operation: string;

    private readonly scoutInstance: Scout;
    private stopped: boolean;
    private childSpans: ScoutSpan[] = [];

    constructor(operation: string, id: string, req: ScoutRequest, s: Scout) {
        this.scoutInstance = s;
        this.request = req;
        this.id = id;
        this.operation = operation;
    }

    /** @see Taggable */
    public addTags(tags: ScoutTag[]): Promise<this> {
        // If tags is empty then return early
        if (!tags || tags.length === 0) { return Promise.resolve(this); }

        // Send all tags
        return Promise.all(tags.map(({name, value}) => this.scoutInstance.tagSpan(this, name, value)))
            .then(() => this);
    }

    /** @see ChildSpannable */
    public startChildSpan(operation: string): Promise<ScoutSpan> {
        if (this.stopped) {
            return Promise.reject(new Errors.FinishedRequest(
                "Cannot add a child span to a finished span",
            ));
        }

        return this.scoutInstance
            .startSpan(operation, this.request, this)
            .then(span => {
                this.childSpans.push(span);
                return span;
            });
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

        // Stop all child spans
        return Promise.all(this.childSpans.map(s => s.stop()))
        // Stop this span
            .then(() => this.scoutInstance.stopSpan(this))
            .then(() => this.stopped = true)
            .then(() => this);
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

    public startRequest(): Promise<ScoutRequest> {
        if (!this.hasAgent()) {
            const err = new Errors.Disconnected("No agent is present, please run .setup()");
            this.logFn(err.message, LogLevel.Error);
            return Promise.reject(err);
        }

        const req = new Requests.V1StartRequest();
        return this.agent
            .send(req)
            .then(() => new ScoutRequest(req.requestId, this));
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
            .then(() => new ScoutSpan(operation, startSpan.spanId, req, this));
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
