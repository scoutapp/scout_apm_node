"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const path = require("path");
const process = require("process");
const uuid_1 = require("uuid");
const types_1 = require("./types");
const web_1 = require("./agent-downloaders/web");
const external_process_1 = require("./agents/external-process");
const Requests = require("./protocol/v1/requests");
const Constants = require("./constants");
const Errors = require("./errors");
class ScoutRequest {
    constructor(opts) {
        this.started = false;
        this.finished = false;
        this.sent = false;
        this.childSpans = [];
        this.tags = {};
        this.logFn = () => undefined;
        this.id = opts && opts.id ? opts.id : `${Constants.DEFAULT_REQUEST_PREFIX}${uuid_1.v4()}`;
        if (opts) {
            if (opts.logFn) {
                this.logFn = opts.logFn;
            }
            if (opts.scoutInstance) {
                this.scoutInstance = opts.scoutInstance;
            }
            if (opts.timestamp) {
                this.timestamp = opts.timestamp;
            }
            // It's possible that the scout request has already been started
            // ex. when startRequest is used by a Scout instance
            if (opts.started) {
                this.started = opts.started;
            }
        }
    }
    span(operation) {
        return this.startChildSpan(operation);
    }
    getTimestamp() {
        return new Date(this.timestamp);
    }
    /** @see ChildSpannable */
    startChildSpan(operation) {
        if (this.finished) {
            this.logFn(`[scout/request/${this.id}] Cannot add a child span to a finished request [${this.id}]`, types_1.LogLevel.Error);
            return Promise.reject(new Errors.FinishedRequest("Cannot add a child span to a finished request"));
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
    getChildSpans() {
        return Promise.resolve(this.childSpans);
    }
    /** @see Taggable */
    addTags(tags) {
        tags.forEach(t => this.tags[t.name] = t.value);
        return Promise.resolve(this);
    }
    finish() {
        return this.stop();
    }
    finishAndSend() {
        return this.finish()
            .then(() => this.send());
    }
    isStopped() {
        return this.finished;
    }
    stop() {
        if (this.finished) {
            return Promise.resolve(this);
        }
        // Stop all child spans
        this.childSpans.forEach(s => s.stop());
        // Finish the request
        this.finished = true;
        return Promise.resolve(this);
    }
    isStarted() {
        return this.started;
    }
    start() {
        if (this.started) {
            return Promise.resolve(this);
        }
        this.timestamp = new Date();
        this.started = true;
        return Promise.resolve(this);
    }
    /**
     * Send this request and internal spans to the scoutInstance
     *
     * @returns this request
     */
    send(scoutInstance) {
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
            .then(() => Promise.all(Object.entries(this.tags).map(([name, value]) => inst.sendTagRequest(this, name, value))))
            // End the span
            .then(() => inst.sendStopRequest(this))
            .then(() => this.sent = true)
            .then(() => this)
            .catch(err => {
            this.logFn(`[scout/request/${this.id}]Failed to send request`);
            return this;
        });
    }
}
exports.ScoutRequest = ScoutRequest;
class ScoutSpan {
    constructor(opts) {
        this.started = false;
        this.stopped = false;
        this.sent = false;
        this.childSpans = [];
        this.tags = {};
        this.logFn = () => undefined;
        this.request = opts.request;
        this.id = opts && opts.id ? opts.id : `${Constants.DEFAULT_SPAN_PREFIX}${uuid_1.v4()}`;
        this.operation = opts.operation;
        if (opts) {
            if (opts.logFn) {
                this.logFn = opts.logFn;
            }
            if (opts.scoutInstance) {
                this.scoutInstance = opts.scoutInstance;
            }
            if (opts.timestamp) {
                this.timestamp = opts.timestamp;
            }
            // It's possible that the scout span has already been started
            // ex. when startSpan is used by a Scout instance
            if (opts.started) {
                this.started = opts.started;
            }
        }
    }
    getTimestamp() {
        return new Date(this.timestamp);
    }
    /** @see Taggable */
    addTags(tags) {
        tags.forEach(t => this.tags[t.name] = t.value);
        return Promise.resolve(this);
    }
    /** @see ChildSpannable */
    startChildSpan(operation) {
        if (this.stopped) {
            this.logFn(`[scout/request/${this.request.id}/span/${this.id}] Cannot add span to stopped span [${this.id}]`, types_1.LogLevel.Error);
            return Promise.reject(new Errors.FinishedRequest("Cannot add a child span to a finished span"));
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
    getChildSpans() {
        return Promise.resolve(this.childSpans);
    }
    finish() {
        return this.stop();
    }
    finishAndSend() {
        return this.finish()
            .then(() => this.send());
    }
    isStopped() {
        return this.stopped;
    }
    stop() {
        if (this.stopped) {
            return Promise.resolve(this);
        }
        this.stopped = true;
        // Stop all child spans
        this.childSpans.forEach(s => s.stop());
        return Promise.resolve(this);
    }
    isStarted() {
        return this.started;
    }
    start() {
        if (this.started) {
            return Promise.resolve(this);
        }
        this.timestamp = new Date();
        this.started = true;
        return Promise.resolve(this);
    }
    /**
     * Send this span and internal spans to the scoutInstance
     *
     * @returns this span
     */
    send(scoutInstance) {
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
            .then(() => Promise.all(Object.entries(this.tags).map(([name, value]) => inst.sendTagSpan(this, name, value))))
            // End the span
            .then(() => inst.sendStopSpan(this))
            .then(() => this.sent = true)
            .then(() => this)
            .catch(err => {
            this.logFn(`[scout/request/${this.request.id}/span/${this.id}}] Failed to send span`);
            return this;
        });
    }
}
exports.ScoutSpan = ScoutSpan;
class Scout extends events_1.EventEmitter {
    constructor(config, opts) {
        super();
        this.downloaderOptions = {};
        this.config = config || types_1.buildScoutConfiguration();
        this.logFn = opts && opts.logFn ? opts.logFn : () => undefined;
        if (opts && opts.downloadOptions) {
            this.downloaderOptions = opts.downloadOptions;
        }
        this.applicationMetadata = new types_1.ApplicationMetadata(this.config, opts && opts.appMeta ? opts.appMeta : {});
    }
    getCoreAgentVersion() {
        return new types_1.CoreAgentVersion(this.coreAgentVersion.raw);
    }
    getApplicationMetadata() {
        return Object.assign({}, this.applicationMetadata);
    }
    setup() {
        this.downloader = new web_1.default({ logFn: this.logFn });
        // Ensure coreAgentVersion is present
        if (!this.config.coreAgentVersion) {
            const err = new Error("No core agent version specified!");
            this.logFn(err.message, types_1.LogLevel.Error);
            return Promise.reject(err);
        }
        this.coreAgentVersion = new types_1.CoreAgentVersion(this.config.coreAgentVersion);
        // Build options for download
        this.downloaderOptions = Object.assign({
            cacheDir: Constants.DEFAULT_CORE_AGENT_DOWNLOAD_CACHE_DIR,
            updateCache: true,
        }, this.downloaderOptions, types_1.buildDownloadOptions(this.config));
        // Download the appropriate binary
        return this.downloader
            .download(this.coreAgentVersion, this.downloaderOptions)
            .then(bp => {
            this.binPath = bp;
            this.socketPath = path.join(path.dirname(this.binPath), "core-agent.sock");
            this.logFn(`[scout] using socket path [${this.socketPath}]`, types_1.LogLevel.Debug);
        })
            // Build options for the agent and create the agent
            .then(() => {
            this.processOptions = new types_1.ProcessOptions(this.binPath, this.getSocketPath(), types_1.buildProcessOptions(this.config));
            this.setupAgent(new external_process_1.default(this.processOptions, this.logFn));
        })
            // Start, connect, and register
            .then(() => {
            this.logFn(`[scout] starting process w/ bin @ path [${this.binPath}]`, types_1.LogLevel.Debug);
            this.logFn(`[scout] process options:\n${JSON.stringify(this.processOptions)}`, types_1.LogLevel.Debug);
            return this.agent.start();
        })
            .then(() => this.logFn("[scout] agent successfully started", types_1.LogLevel.Debug))
            .then(() => this.agent.connect())
            .then(() => this.logFn("[scout] successfully connected to agent", types_1.LogLevel.Debug))
            .then(() => {
            if (!this.config.name) {
                this.logFn("[scout] 'name' configuration value missing", types_1.LogLevel.Warn);
            }
            if (!this.config.key) {
                this.logFn("[scout] 'key' missing in configuration", types_1.LogLevel.Warn);
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
    startRequest(opts) {
        const request = new ScoutRequest(Object.assign({}, { scoutInstance: this }, opts || {}));
        return request.start();
    }
    /**
     * Send the StartRequest message to the agent
     *
     * @param {ScoutRequest} req - The original request
     * @returns {Promise<ScoutRequest>} the passed in request
     */
    sendStartRequest(req) {
        const startReq = new Requests.V1StartRequest({
            requestId: req.id,
            timestamp: req.getTimestamp(),
        });
        return this
            .sendThroughAgent(startReq)
            .then(() => req)
            .catch(err => {
            this.logFn("[scout] failed to send start request request", types_1.LogLevel.Error);
            return req;
        });
    }
    /**
     * Send the StopRequest message to the agent
     *
     * @param {ScoutRequest} req - The original request
     * @returns {Promise<ScoutRequest>} the passed in request
     */
    sendStopRequest(req) {
        const stopReq = new Requests.V1FinishRequest(req.id);
        return this
            .sendThroughAgent(stopReq)
            .then(() => req)
            .catch(err => {
            this.logFn("[scout] failed to send stop request request", types_1.LogLevel.Error);
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
    sendTagRequest(req, name, value) {
        const tagReq = new Requests.V1TagRequest(name, value, req.id);
        return this
            .sendThroughAgent(tagReq)
            .then(() => undefined)
            .catch(err => {
            this.logFn("[scout] failed to send tag request", types_1.LogLevel.Error);
        });
    }
    /**
     * Send the StartSpan message to the agent
     *
     * @param {ScoutSpan} span - The original span
     * @returns {Promise<ScoutSpan>} the passed in span
     */
    sendStartSpan(span) {
        const opts = {
            spanId: span.id,
            parentId: span.parent ? span.parent.id : undefined,
            timestamp: span.getTimestamp(),
        };
        const startSpanReq = new Requests.V1StartSpan(span.operation, span.request.id, opts);
        return this
            .sendThroughAgent(startSpanReq)
            .then(() => span)
            .catch(err => {
            this.logFn("[scout] failed to send start span request", types_1.LogLevel.Error);
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
    sendTagSpan(span, name, value) {
        const tagSpanReq = new Requests.V1TagSpan(name, value, span.id, span.request.id);
        return this
            .sendThroughAgent(tagSpanReq)
            .then(() => undefined)
            .catch(err => {
            this.logFn("[scout] failed to send tag span request", types_1.LogLevel.Error);
            return undefined;
        });
    }
    /**
     * Send the StopSpan message to the agent
     *
     * @param {ScoutSpan} span - The original span
     * @returns {Promise<ScoutSpan>} the passed in request
     */
    sendStopSpan(span) {
        const stopSpanReq = new Requests.V1StopSpan(span.id, span.request.id);
        return this
            .sendThroughAgent(stopSpanReq)
            .then(() => span)
            .catch(err => {
            this.logFn("[scout] failed to send stop span request", types_1.LogLevel.Error);
            return span;
        });
    }
    shutdown() {
        return this.agent
            .disconnect()
            .then(() => {
            if (this.config.allowShutdown) {
                return this.agent.stopProcess();
            }
        });
    }
    hasAgent() {
        return this.agent !== null;
    }
    getAgent() {
        return this.agent;
    }
    getSocketPath() {
        return `unix://${this.socketPath}`;
    }
    buildAppMetadataEvent() {
        return new Requests.V1ApplicationEvent(`Pid: ${process.pid}`, "scout.metadata", this.applicationMetadata.serialize(), { timestamp: new Date() });
    }
    // Helper for sending app metadata
    sendAppMetadataEvent() {
        return this
            .sendThroughAgent(this.buildAppMetadataEvent(), { async: true })
            .then(() => undefined)
            .catch(err => {
            this.logFn("[scout] failed to send start request request", types_1.LogLevel.Error);
        });
    }
    sendRegistrationRequest() {
        return this
            .sendThroughAgent(new Requests.V1Register(this.config.name || "", this.config.key || "", types_1.APIVersion.V1))
            .then(() => undefined)
            .catch(err => {
            this.logFn("[scout] failed to send app registration request", types_1.LogLevel.Error);
        });
    }
    /**
     * Helper function for sending a given request through the agent
     *
     * @param {T extends BaseAgentRequest} msg - The message to send
     * @returns {Promise<T extends BaseAgentResponse>} resp - The message to send
     */
    sendThroughAgent(msg, opts) {
        if (!this.hasAgent()) {
            const err = new Errors.Disconnected("No agent is present, please run .setup()");
            this.logFn(err.message, types_1.LogLevel.Error);
            return Promise.reject(err);
        }
        if (!this.config.monitor) {
            this.logFn("[scout] monitoring disabled, not sending tag request", types_1.LogLevel.Warn);
            return Promise.reject(new Errors.MonitoringDisabled());
        }
        if (opts && opts.async) {
            return this.agent.sendAsync(msg);
        }
        return this.agent.send(msg);
    }
    // Helper function for setting up an agent to be part of the scout instance
    setupAgent(agent) {
        this.agent = agent;
        // Setup forwarding of all events of the agent through the scout instance
        Object.values(types_1.AgentEvent).forEach(evt => {
            this.agent.on(evt, msg => this.emit(evt, msg));
        });
        return Promise.resolve();
    }
}
exports.Scout = Scout;
