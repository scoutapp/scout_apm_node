"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const path = require("path");
const process = require("process");
const nrc = require("node-request-context");
const cls = require("continuation-local-storage");
const semver = require("semver");
const types_1 = require("../types");
const index_1 = require("../index");
const integrations_1 = require("../integrations");
const web_1 = require("../agent-downloaders/web");
const external_process_1 = require("../agents/external-process");
const Requests = require("../protocol/v1/requests");
const Constants = require("../constants");
const Errors = require("../errors");
var request_1 = require("./request");
exports.ScoutRequest = request_1.default;
var span_1 = require("./span");
exports.ScoutSpan = span_1.default;
const request_2 = require("./request");
class Scout extends events_1.EventEmitter {
    constructor(config, opts) {
        super();
        this.downloaderOptions = {};
        this.canUseAsyncHooks = false;
        this.config = config || types_1.buildScoutConfiguration();
        this.logFn = opts && opts.logFn ? opts.logFn : () => undefined;
        if (opts && opts.downloadOptions) {
            this.downloaderOptions = opts.downloadOptions;
        }
        this.applicationMetadata = new types_1.ApplicationMetadata(this.config, opts && opts.appMeta ? opts.appMeta : {});
        // Check node version for before/after
        this.canUseAsyncHooks = semver.gte(process.version, "8.9.0");
        // Create async namespace
        this.asyncNamespace = this.canUseAsyncHooks ? nrc.createNamespace("scout") : cls.createNamespace("scout");
    }
    getCoreAgentVersion() {
        return new types_1.CoreAgentVersion(this.coreAgentVersion.raw);
    }
    getApplicationMetadata() {
        return Object.assign({}, this.applicationMetadata);
    }
    setup() {
        // Return early if agent has already been set up
        if (this.agent) {
            return Promise.resolve(this);
        }
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
            // Set up integration(s)
            .then(() => {
            Object.keys(index_1.EXPORT_BAG)
                .map(packageName => integrations_1.getIntegrationForPackage(packageName))
                .forEach(integration => integration.setScoutInstance(this));
        })
            .then(() => this);
    }
    shutdown() {
        if (!this.agent) {
            this.logFn("[scout] shutdown called but no agent to shutdown is present", types_1.LogLevel.Error);
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
    hasAgent() {
        return this.agent !== null;
    }
    getAgent() {
        return this.agent;
    }
    /**
     * Function for checking whether a given path (URL) is ignored by scout
     *
     * @param {string} path - processed path (ex. "/api/v1/echo/:name")
     * @returns {boolean} whether the path should be ignored
     */
    ignoresPath(path) {
        this.logFn("[scout] checking path [${path}] against ignored paths", types_1.LogLevel.Trace);
        // If ignore isn't specified or if empty, then nothing is ignored
        if (!this.config.ignore || this.config.ignore.length === 0) {
            return false;
        }
        const matchingPrefix = this.config.ignore.find(prefix => path.indexOf(prefix) === 0);
        if (matchingPrefix) {
            this.logFn("[scout] ignoring path [${path}] matching prefix [${matchingPrefix}]", types_1.LogLevel.Debug);
            this.emit(types_1.ScoutEvent.IgnoredPathDetected, path);
        }
        return matchingPrefix !== undefined;
    }
    /**
     * Filter a given request path (ex. /path/to/resource) according to logic before storing with Scout
     *
     * @param {string} path
     * @returns {URL} the filtered URL object
     */
    filterRequestPath(path) {
        switch (this.config.uriReporting) {
            case types_1.URIReportingLevel.FilteredParams:
                return types_1.scrubRequestPathParams(path);
            case types_1.URIReportingLevel.Path:
                return types_1.scrubRequestPath(path);
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
    transaction(name, cb) {
        return this.withAsyncRequestContext(cb);
    }
    /**
     * Start an insrumentation, withing a given transaction
     *
     * @param {string} operation
     * @param {Function} cb
     * @returns {Promise<any>} a promsie that resolves to the result of the callback
     */
    instrument(operation, cb) {
        const parent = this.getCurrentSpan() || this.getCurrentRequest();
        // If no request is currently underway
        if (!parent) {
            this.logFn("[scout] Failed to start instrumentation, no current transaction/parent instrumentation", types_1.LogLevel.Error);
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
            if (!ranCb) {
                result = cb();
            }
            this.logFn("[scout] failed to send start span", types_1.LogLevel.Error);
            return result;
        });
    }
    /**
     * Reterieve the current request using the async hook/continuation local storage machinery
     *
     * @returns {ScoutRequest} the current active request
     */
    getCurrentRequest() {
        return this.asyncNamespace.get("scout.request");
    }
    /**
     * Reterieve the current span using the async hook/continuation local storage machinery
     *
     * @returns {ScoutSpan} the current active span
     */
    getCurrentSpan() {
        return this.asyncNamespace.get("scout.span");
    }
    /**
     * Perform some action within a context
     *
     */
    withAsyncRequestContext(cb) {
        // If we can use async hooks then node-request-context is usable
        return new Promise((resolve) => {
            let result;
            let req;
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
                    if (!ranCb) {
                        result = cb();
                    }
                    resolve(result);
                    this.logFn("[scout] failed to send start request request", types_1.LogLevel.Error);
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
    startRequest(opts) {
        const request = new request_2.default(Object.assign({}, { scoutInstance: this }, opts || {}));
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
            .then(() => {
            this.emit(types_1.ScoutEvent.RequestSent, { request: req });
            return req;
        })
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
     * @returns {Promise<void>} A promise which resolves when the message has been
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
