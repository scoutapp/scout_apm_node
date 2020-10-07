"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const path = require("path");
const process = require("process");
const cls = require("cls-hooked");
const semver = require("semver");
const fs_extra_1 = require("fs-extra");
const types_1 = require("../types");
const global_1 = require("../global");
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
const DONE_NOTHING = () => undefined;
const ASYNC_NS = "scout";
const ASYNC_NS_REQUEST = `${ASYNC_NS}.request`;
const ASYNC_NS_SPAN = `${ASYNC_NS}.span`;
class Scout extends events_1.EventEmitter {
    constructor(config, opts) {
        super();
        this.downloaderOptions = {};
        this.slowRequestThresholdMs = Constants.DEFAULT_SLOW_REQUEST_THRESHOLD_MS;
        this.syncCurrentRequest = null;
        this.syncCurrentSpan = null;
        this.config = config || types_1.buildScoutConfiguration();
        this.logFn = opts && opts.logFn ? opts.logFn : () => undefined;
        if (opts) {
            if (opts.downloadOptions) {
                this.downloaderOptions = opts.downloadOptions;
            }
            if (opts.slowRequestThresholdMs) {
                this.slowRequestThresholdMs = opts.slowRequestThresholdMs;
            }
        }
        this.applicationMetadata = new types_1.ApplicationMetadata(this.config, opts && opts.appMeta ? opts.appMeta : {});
        let version = this.config.coreAgentVersion || Constants.DEFAULT_CORE_AGENT_VERSION;
        if (version[0] === "v") {
            version = version.slice(1);
        }
        // Build expected bin & socket path based on current version
        const triple = types_1.generateTriple();
        this.binPath = path.join(Constants.DEFAULT_CORE_AGENT_DOWNLOAD_CACHE_DIR, `scout_apm_core-v${version}-${triple}`, Constants.CORE_AGENT_BIN_FILE_NAME);
        // If the logFn that is provided has a 'logger' attempt to set the log level to the passed in logger's level
        if (this.logFn && this.logFn.logger && this.logFn.logger.level && types_1.isLogLevel(this.logFn.logger.level)) {
            this.config.logLevel = types_1.parseLogLevel(this.logFn.logger.level);
        }
        // Create async namespace if it does not exist
        this.createAsyncNamespace();
    }
    get socketPath() {
        if (this.config.socketPath) {
            return this.config.socketPath;
        }
        // For core-agents version less than CORE_AGENT_TCP_SOCKET_MIN_VERSION
        // use a unix socket path based on the default socket file name as the default
        if (semver.lt(this.coreAgentVersion.toString(), Constants.CORE_AGENT_TCP_SOCKET_MIN_VERSION)) {
            return path.join(path.dirname(this.binPath), Constants.DEFAULT_SOCKET_FILE_NAME);
        }
        // For core agents newer than CORE_AGENT_TCP_SOCKET_MIN_VERSION, use TCP
        return `tcp://127.0.0.1:6590`;
    }
    getSocketPath() {
        return this.getSocketType() === types_1.AgentSocketType.TCP ? this.socketPath : `unix://${this.socketPath}`;
    }
    getSocketType() {
        if (this.socketPath.startsWith("tcp://")) {
            return types_1.AgentSocketType.TCP;
        }
        return types_1.AgentSocketType.Unix;
    }
    getSocketFilePath() {
        return this.socketPath.slice();
    }
    getCoreAgentVersion() {
        return new types_1.CoreAgentVersion(this.coreAgentVersion.raw);
    }
    getApplicationMetadata() {
        return Object.assign({}, this.applicationMetadata);
    }
    getConfig() {
        return this.config;
    }
    getAgent() {
        return this.agent;
    }
    getSlowRequestThresholdMs() {
        return this.slowRequestThresholdMs;
    }
    log(msg, lvl) {
        this.logFn(msg, lvl);
    }
    /**
     * Helper to facilitate non-blocking setup
     *
     * @throws ScoutSettingUp if the scout instance is still setting up (rather than waiting)
     */
    setupNonBlocking() {
        if (!this.settingUp) {
            return this.setup();
        }
        return Promise.race([this.settingUp, Promise.reject(new Errors.InstanceNotReady())]);
    }
    setup() {
        // Return early if agent has already been set up
        if (this.agent) {
            return Promise.resolve(this);
        }
        // If setting up has already begun return that
        if (this.settingUp) {
            return this.settingUp;
        }
        this.log("[scout] setting up scout...", types_1.LogLevel.Debug);
        const shouldLaunch = this.config.coreAgentLaunch;
        // If the socket path exists then we may be able to skip downloading and launching
        this.settingUp = (shouldLaunch ? this.downloadAndLaunchAgent() : this.createAgentForExistingSocket())
            .then(() => {
            if (!this.agent) {
                throw new Errors.NoAgentPresent();
            }
            return this.agent.connect();
        })
            .then(() => this.log("[scout] successfully connected to agent", types_1.LogLevel.Debug))
            .then(() => {
            if (!this.config.name) {
                this.log("[scout] 'name' configuration value missing", types_1.LogLevel.Warn);
            }
            if (!this.config.key) {
                this.log("[scout] 'key' missing in configuration", types_1.LogLevel.Warn);
            }
        })
            // Register the application
            .then(() => {
            if (!this.agent) {
                throw new Errors.NoAgentPresent();
            }
            return this.agent.setRegistrationAndMetadata(new Requests.V1Register(this.config.name || "", this.config.key || "", types_1.APIVersion.V1), this.buildAppMetadataEvent());
        })
            // Send the registration and app metadata
            .then(() => this.sendRegistrationRequest())
            .then(() => this.sendAppMetadataEvent())
            // Set up integration(s)
            .then(() => this.setupIntegrations())
            // Set up process uncaught exception handler
            .then(() => {
            this.uncaughtExceptionListenerFn = (err) => this.onUncaughtExceptionListener(err);
            process.on("uncaughtException", this.uncaughtExceptionListenerFn);
        })
            // Set up this scout instance as the global one, if there isn't already one
            .then(() => global_1.setActiveGlobalScoutInstance(this))
            .then(() => this);
        return this.settingUp;
    }
    shutdown() {
        if (!this.agent) {
            this.log("[scout] shutdown called but no agent to shutdown is present", types_1.LogLevel.Error);
            return Promise.reject(new Errors.NoAgentPresent());
        }
        // Disable the uncaughtException listener
        if (this.uncaughtExceptionListenerFn) {
            process.removeListener("uncaughtException", this.uncaughtExceptionListenerFn);
        }
        return this.agent
            .disconnect()
            .then(() => {
            if (this.config.allowShutdown && this.agent) {
                return this.agent.stopProcess();
            }
        })
            // Remove the agent, emit the shutdown event
            .then(() => {
            this.agent = null;
            this.emit(types_1.ScoutEvent.Shutdown);
        });
    }
    hasAgent() {
        return typeof this.agent !== "undefined" && this.agent !== null;
    }
    isShutdown() {
        return this.agent === null;
    }
    /**
     * Function for checking whether a given path (URL) is ignored by scout
     *
     * @param {string} path - processed path (ex. "/api/v1/echo/:name")
     * @returns {boolean} whether the path should be ignored
     */
    ignoresPath(path) {
        this.log("[scout] checking path [${path}] against ignored paths", types_1.LogLevel.Debug);
        // If ignore isn't specified or if empty, then nothing is ignored
        if (!this.config.ignore || this.config.ignore.length === 0) {
            return false;
        }
        const matchingPrefix = this.config.ignore.find(prefix => path.indexOf(prefix) === 0);
        if (matchingPrefix) {
            this.log("[scout] ignoring path [${path}] matching prefix [${matchingPrefix}]", types_1.LogLevel.Debug);
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
     * @param {Function} callback
     * @returns void
     */
    transaction(name, cb) {
        this.log(`[scout] Starting transaction [${name}]`, types_1.LogLevel.Debug);
        let ranContext = false;
        // Setup if necessary then then perform the async request context
        return this.setup()
            .then(() => {
            ranContext = true;
            return this.withAsyncRequestContext(cb);
        })
            .catch(err => {
            this.log("[scout] Scout setup failed: ${err}", types_1.LogLevel.Error);
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
    transactionSync(name, fn) {
        this.log(`[scout] Starting transaction [${name}]`, types_1.LogLevel.Debug);
        // Create & start the request synchronously
        const request = this.startRequestSync();
        this.syncCurrentRequest = request;
        const result = fn({ request });
        request.stopSync();
        // Reset the current request as sync
        this.syncCurrentRequest = null;
        // Fire and forget the request
        request.finishAndSend();
        return result;
    }
    /**
     * Start an instrumentation, within a given transaction
     *
     * @param {string} operation
     * @param {Function} cb
     * @returns {Promise<any>} a promsie that resolves to the result of the callback
     */
    instrument(operation, cb) {
        const parent = this.getCurrentSpan() || this.getCurrentRequest() || undefined;
        const request = this.getCurrentRequest() || undefined;
        const parentIsSpan = parent !== request;
        this.log(`[scout] Instrumenting operation [${operation}], parent? [${parent ? parent.id : "NONE"}]`, types_1.LogLevel.Debug);
        // Create a transaction if instrument was called without an encapsulating request
        if (!parent && !request) {
            this.log("[scout] Creating request for instrumentation", types_1.LogLevel.Warn);
            return this.transaction(operation, transactionDone => {
                // Create a modified callback which finishes the transaction after first instrumentation
                const modifiedCb = (spanDone, info) => {
                    // Call the original callback, but give it a done function that finished the span
                    // *and* the request, and pass along the info
                    return cb(() => spanDone().then(() => transactionDone()), info);
                };
                return this.instrument(operation, modifiedCb);
            });
        }
        // Both parent and request must be present -- no span can start
        // without a parent request (and that would be the parent)
        if (!parent || !request) {
            this.log("[scout] Failed to start instrumentation, no current transaction/parent instrumentation", types_1.LogLevel.Error);
            return Promise.resolve(cb(DONE_NOTHING, {}));
        }
        let result;
        let ranCb = false;
        this.log(`[scout] Starting child span for operation [${operation}], parent id [${parent.id}]`, types_1.LogLevel.Debug);
        let span;
        return new Promise((resolve, reject) => {
            // Create a new async context for the instrumentation
            this.asyncNamespace.run(() => {
                // Create a done function that will clear the entry and stop the span
                const doneFn = () => {
                    // Set the parent for other sibling/same-level spans
                    if (parentIsSpan) {
                        // If the parent of this span is a span, then we want other spans in this namespace
                        // to be children of that parent span, so save the parent
                        this.asyncNamespace.set(ASYNC_NS_SPAN, parent);
                    }
                    else {
                        // If the parent of this span *not* a span,
                        // then the parent of sibling spans should be the request,
                        // so we can clear the current span entry
                        this.clearAsyncNamespaceEntry(ASYNC_NS_SPAN);
                        this.clearAsyncNamespaceEntry(ASYNC_NS_REQUEST);
                    }
                    // If we never made the span object then don't do anything
                    if (!span) {
                        return Promise.resolve();
                    }
                    // If we did create the span, note that it was stopped successfully
                    this.log(`[scout] Stopped span with ID [${span.id}]`, types_1.LogLevel.Debug);
                    return Promise.resolve();
                };
                // If parent has become invalidated, then run the callback and exit
                if (!parent) {
                    resolve(cb(DONE_NOTHING, {}));
                    return;
                }
                // Create & start a child span on the current parent (request/span)
                parent
                    .startChildSpan(operation)
                    .then(s => span = s)
                    .then(() => {
                    // Set the span & request on the namespace
                    this.asyncNamespace.set(ASYNC_NS_REQUEST, request);
                    this.asyncNamespace.set(ASYNC_NS_SPAN, span);
                    // Set function to call on finish
                    span.setOnStop(() => {
                        const result = doneFn();
                        if (span) {
                            span.clearOnStop();
                        }
                        return result;
                    });
                    // Set that the cb has been run, in the case of error so we don't run twice
                    ranCb = true;
                    const result = cb(() => span.stop(), { span, request, parent });
                    // Ensure that the result is a promise
                    resolve(result);
                })
                    // Return the result
                    .catch(err => {
                    // NOTE: it is possible for span to be missing here if startChildSpan() fails
                    if (!span) {
                        this.log("[scout] error during instrument(), startChildSpan likely failed\n ERROR: ${err}", types_1.LogLevel.Error);
                    }
                    // It's possible that an error happened *before* the callback could be run
                    if (!ranCb) {
                        result = cb(() => span.stop(), { span, request, parent });
                    }
                    this.log("[scout] failed to send start span", types_1.LogLevel.Error);
                    // Ensure that the result is a promise
                    resolve(result);
                });
            });
        });
    }
    /**
     * Instrumentation for synchronous methods
     *
     * @param {string} operation - operation name for the span
     * @param {SpanCallback} fn - function to execute
     * @param {ScoutRequest} [requestOverride] - The request on which to start the span to execute
     * @throws {NoActiveRequest} If there is no request in scope (via async context or override param)
     */
    instrumentSync(operation, fn, requestOverride) {
        let parent = requestOverride || this.syncCurrentSpan || this.syncCurrentRequest;
        // Check the async sources in case we're in a async context but not a sync one
        parent = parent || this.getCurrentSpan() || this.getCurrentRequest();
        // If there isn't a current parent for instrumentSync, auto create one
        if (!parent) {
            this.log("[scout] parent context missing for synchronous instrumentation (via async context or passed in)", types_1.LogLevel.Warn);
            return this.transactionSync(operation, () => this.instrumentSync(operation, fn));
        }
        // Start a child span of the parent synchronously
        const span = parent.startChildSpanSync(operation);
        this.syncCurrentSpan = span;
        span.startSync();
        const result = fn({
            span,
            parent,
            request: this.getCurrentRequest() || undefined,
        });
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
    addContext(name, value, parentOverride) {
        let parent = this.getCurrentSpan() || this.getCurrentRequest();
        // If we're not in an async context then attempt to use the sync parent span or request
        if (!parent) {
            parent = this.syncCurrentSpan || this.syncCurrentRequest;
        }
        // If a parent override was provided, use it
        if (parentOverride) {
            parent = parentOverride;
        }
        // If no request is currently underway
        if (!parent) {
            this.log("[scout] Failed to add context, no current parent instrumentation", types_1.LogLevel.Error);
            return Promise.resolve();
        }
        this.log(`[scout] Adding context (${name}, ${value}) to parent ${parent.id}`, types_1.LogLevel.Debug);
        return parent.addContext(name, value);
    }
    /**
     * Retrieve the current request using the async hook/continuation local storage machinery
     *
     * @returns {ScoutRequest} the current active request
     */
    getCurrentRequest() {
        try {
            const req = this.asyncNamespace.get(ASYNC_NS_REQUEST);
            return req || this.syncCurrentRequest;
        }
        catch (_a) {
            return null;
        }
    }
    /**
     * Retrieve the current span using the async hook/continuation local storage machinery
     *
     * @returns {ScoutSpan} the current active span
     */
    getCurrentSpan() {
        try {
            const span = this.asyncNamespace.get(ASYNC_NS_SPAN);
            return span || this.syncCurrentSpan;
        }
        catch (_a) {
            return null;
        }
    }
    // Setup integrations
    setupIntegrations() {
        Object.keys(global_1.EXPORT_BAG)
            .map(packageName => integrations_1.getIntegrationForPackage(packageName))
            .forEach(integration => integration.setScoutInstance(this));
    }
    /**
     * Attempt to clear an async name space entry
     *
     * this.asyncNamespace.set can fail if the async context ID is already gone
     * before someone tries to clear it. This can happen if some caller moves calls to
     * another async context or if it's cleaned up suddenly
     */
    clearAsyncNamespaceEntry(key) {
        try {
            this.asyncNamespace.set(key, undefined);
        }
        catch (_a) {
            this.logFn("failed to clear async namespace", types_1.LogLevel.Debug);
        }
    }
    // Helper for creating an ExternalProcessAgent for an existing, listening agent
    createAgentForExistingSocket(socketPath) {
        this.log(`[scout] detected existing socket @ [${this.socketPath}], skipping agent launch`, types_1.LogLevel.Debug);
        socketPath = socketPath || this.socketPath;
        // Check if the socketPath exists
        return fs_extra_1.pathExists(socketPath)
            .then(exists => {
            if (!exists) {
                throw new Errors.InvalidConfiguration("socket @ path [${socketPath}] does not exist");
            }
        })
            // Build process options and agent
            .then(() => {
            this.processOptions = new types_1.ProcessOptions(this.binPath, this.getSocketPath(), types_1.buildProcessOptions(this.config));
            return new external_process_1.default(this.processOptions, this.logFn);
        })
            .then(agent => this.setupAgent(agent));
    }
    // Helper for downloading and launching an agent
    downloadAndLaunchAgent() {
        this.log(`[scout] downloading and launching agent`, types_1.LogLevel.Debug);
        this.downloader = new web_1.default({ logFn: this.logFn });
        // Ensure coreAgentVersion is present
        if (!this.config.coreAgentVersion) {
            const err = new Error("No core agent version specified!");
            this.log(err.message, types_1.LogLevel.Error);
            return Promise.reject(err);
        }
        this.coreAgentVersion = new types_1.CoreAgentVersion(this.config.coreAgentVersion);
        // Build options for download
        this.downloaderOptions = Object.assign({
            cacheDir: path.dirname(this.binPath),
            updateCache: true,
        }, this.downloaderOptions, types_1.buildDownloadOptions(this.config));
        // Download the appropriate binary
        return this.downloader
            .download(this.coreAgentVersion, this.downloaderOptions)
            .then(bp => {
            this.binPath = bp;
            this.log(`[scout] using socket path [${this.socketPath}]`, types_1.LogLevel.Debug);
        })
            // Build options for the agent and create the agent
            .then(() => {
            this.processOptions = new types_1.ProcessOptions(this.binPath, this.getSocketPath(), types_1.buildProcessOptions(this.config));
            const agent = new external_process_1.default(this.processOptions, this.logFn);
            if (!agent) {
                throw new Errors.NoAgentPresent();
            }
            return this.setupAgent(agent);
        })
            // Once we have an agent (this.agent is also set), then start, connect, and register
            .then(() => {
            this.log(`[scout] starting process w/ bin @ path [${this.binPath}]`, types_1.LogLevel.Debug);
            this.log(`[scout] process options:\n${JSON.stringify(this.processOptions)}`, types_1.LogLevel.Debug);
            if (!this.agent) {
                throw new Errors.NoAgentPresent();
            }
            return this.agent.start();
        })
            .then(() => this.log("[scout] agent successfully started", types_1.LogLevel.Debug))
            .then(() => {
            if (!this.agent) {
                throw new Errors.NoAgentPresent();
            }
            return this.agent;
        });
    }
    /**
     * Create an async namespace internally for use with tracking if not already present
     */
    createAsyncNamespace() {
        this.asyncNamespace = cls.getNamespace(ASYNC_NS);
        // Create if it doesn't exist
        if (!this.asyncNamespace) {
            this.asyncNamespace = cls.createNamespace(ASYNC_NS);
        }
    }
    /**
     * Perform some action within a context
     *
     */
    withAsyncRequestContext(cb) {
        return new Promise((resolve) => {
            let result;
            let request;
            let ranCb = false;
            // Run in the async namespace
            this.asyncNamespace.run(() => {
                // Make done function that will run after
                const doneFn = () => {
                    // Finish if the request itself is no longer present
                    if (!request) {
                        return Promise.resolve();
                    }
                    this.log(`[scout] Finishing and sending request with ID [${request.id}]`, types_1.LogLevel.Debug);
                    this.clearAsyncNamespaceEntry(ASYNC_NS_REQUEST);
                    this.clearAsyncNamespaceEntry(ASYNC_NS_SPAN);
                    // Finish and send
                    return request.finishAndSend()
                        .then(() => {
                        this.log(`[scout] Finished and sent request [${request.id}]`, types_1.LogLevel.Debug);
                    })
                        .catch(err => {
                        this.log(`[scout] Failed to finish and send request [${request.id}]:\n ${err}`, types_1.LogLevel.Error);
                    });
                };
                this.log(`[scout] Starting request in async namespace...`, types_1.LogLevel.Debug);
                // Bind the cb to this namespace
                cb = this.asyncNamespace.bind(cb);
                // Start the request
                this.startRequest()
                    .then(r => request = r)
                    // Update async namespace, run function
                    .then(() => {
                    this.log(`[scout] Request started w/ ID [${request.id}]`, types_1.LogLevel.Debug);
                    this.asyncNamespace.set(ASYNC_NS_REQUEST, request);
                    // Set function to call on finish
                    // NOTE: at least *two* async contexts will be created for each request -- one for the request
                    // and one for every span started inside the request. this.asyncNamespace is almost certain
                    // to be different by the time that stopFn is run -- we need to bind the stopFn to ensure
                    // the right async namespace gets cleared.
                    const stopFn = () => {
                        const result = doneFn();
                        if (request) {
                            request.clearOnStop();
                        }
                        return result;
                    };
                    request.setOnStop(this.asyncNamespace.bind(stopFn));
                    ranCb = true;
                    result = cb(() => request.stop(), { request });
                    // Ensure that the result is a promise
                    resolve(result);
                })
                    // If an error occurs then run the fn and log
                    .catch(err => {
                    // In the case that an error occurs before the request gets made we can't run doneFn
                    if (!ranCb) {
                        result = request ? cb(() => request.stop(), { request }) : cb(() => undefined, { request });
                    }
                    resolve(result);
                    this.log(`[scout] failed to send start request: ${err}`, types_1.LogLevel.Error);
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
    startRequest(opts) {
        return new Promise((resolve) => resolve(this.startRequestSync(opts)));
    }
    /**
     * Start a scout request synchronously
     *
     * @param {ScoutRequestOptions} [options]
     * @returns {ScoutRequest} a new scout request
     */
    startRequestSync(opts) {
        const request = new request_2.default(Object.assign({}, { scoutInstance: this }, opts || {}));
        return request.startSync();
    }
    buildAppMetadataEvent() {
        return new Requests.V1ApplicationEvent(`Pid: ${process.pid}`, types_1.ApplicationEventType.ScoutMetadata, this.applicationMetadata.serialize(), { timestamp: new Date() });
    }
    // Helper for sending app metadata
    sendAppMetadataEvent() {
        return sendThroughAgent(this, this.buildAppMetadataEvent())
            .then(() => undefined)
            .catch(err => {
            this.log("[scout] failed to send start request request", types_1.LogLevel.Error);
        });
    }
    // Send the app registration request to the current agent
    sendRegistrationRequest() {
        this.log(`[scout] registering application [${this.config.name || ""}]`, types_1.LogLevel.Debug);
        return sendThroughAgent(this, new Requests.V1Register(this.config.name || "", this.config.key || "", types_1.APIVersion.V1))
            .then(() => undefined)
            .catch(err => {
            this.log("[scout] failed to send app registration request", types_1.LogLevel.Error);
        });
    }
    // Helper function for setting up an agent to be part of the scout instance
    setupAgent(agent) {
        this.agent = agent;
        // Setup forwarding of all events of the agent through the scout instance
        Object.values(types_1.AgentEvent).forEach(evt => {
            if (this.agent) {
                this.agent.on(evt, msg => this.emit(evt, msg));
            }
        });
        return Promise.resolve(this.agent);
    }
    onUncaughtExceptionListener(err) {
        // Get the current request if available
        const currentRequest = this.getCurrentRequest();
        if (!currentRequest) {
            return;
        }
        // Mark the curernt request as errored
        currentRequest.addContext(types_1.ScoutContextName.Error, "true");
    }
}
exports.Scout = Scout;
// The functions below are exports for module-level use. They need to be made externally available for
// code in this module but *not* as part of the public API for a Scout instance.
/**
 * Send the StartRequest message to the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutRequest} req - The original request
 * @returns {Promise<ScoutRequest>} the passed in request
 */
function sendStartRequest(scout, req) {
    if (req.isIgnored()) {
        scout.log(`[scout] Skipping sending StartRequest for ignored req [${req.id}]`, types_1.LogLevel.Warn);
        scout.emit(types_1.ScoutEvent.IgnoredRequestProcessingSkipped, req);
        return Promise.resolve(req);
    }
    const startReq = new Requests.V1StartRequest({
        requestId: req.id,
        timestamp: req.getTimestamp(),
    });
    return sendThroughAgent(scout, startReq)
        .then(() => req)
        .catch(err => {
        scout.log(`[scout] failed to send start request request: ${err}`, types_1.LogLevel.Error);
        return req;
    });
}
exports.sendStartRequest = sendStartRequest;
/**
 * Send the StopRequest message to the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutRequest} req - The original request
 * @returns {Promise<ScoutRequest>} the passed in request
 */
function sendStopRequest(scout, req) {
    if (req.isIgnored()) {
        scout.log(`[scout] Skipping sending StopRequest for ignored req [${req.id}]`, types_1.LogLevel.Warn);
        scout.emit(types_1.ScoutEvent.IgnoredRequestProcessingSkipped, req);
        return Promise.resolve(req);
    }
    const stopReq = new Requests.V1FinishRequest(req.id, { timestamp: req.getEndTime() });
    return sendThroughAgent(scout, stopReq)
        .then(() => {
        scout.emit(types_1.ScoutEvent.RequestSent, { request: req });
        return req;
    })
        .catch(err => {
        scout.log("[scout] failed to send stop request request", types_1.LogLevel.Error);
        return req;
    });
}
exports.sendStopRequest = sendStopRequest;
/**
 * Send the TagRequest message to the agent for a single tag
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutRequest} req - The original request
 * @param {String} name - The tag name
 * @param {String} value - The tag value
 * @returns {Promise<void>} A promise which resolves when the message has been sent
 */
function sendTagRequest(scout, req, name, value) {
    if (req.isIgnored()) {
        scout.log(`[scout] Skipping sending TagRequest for ignored req [${req.id}]`, types_1.LogLevel.Warn);
        scout.emit(types_1.ScoutEvent.IgnoredRequestProcessingSkipped, req);
        return Promise.resolve();
    }
    const tagReq = new Requests.V1TagRequest(name, value, req.id);
    return sendThroughAgent(scout, tagReq)
        .then(() => undefined)
        .catch(err => {
        scout.log("[scout] failed to send tag request", types_1.LogLevel.Error);
    });
}
exports.sendTagRequest = sendTagRequest;
/**
 * Send the StartSpan message to the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutSpan} span - The original span
 * @returns {Promise<ScoutSpan>} the passed in span
 */
function sendStartSpan(scout, span) {
    if (span.isIgnored()) {
        scout.log(`[scout] Skipping sending StartSpan for span [${span.id}] of ignored request [${span.requestId}]`, types_1.LogLevel.Warn);
        scout.emit(types_1.ScoutEvent.IgnoredRequestProcessingSkipped, span.requestId);
        return Promise.resolve(span);
    }
    const opts = {
        spanId: span.id,
        parentId: span.parentId,
        timestamp: span.getTimestamp(),
    };
    const startSpanReq = new Requests.V1StartSpan(span.operation, span.requestId, opts);
    return sendThroughAgent(scout, startSpanReq)
        .then(() => span)
        .catch(err => {
        scout.log("[scout] failed to send start span request", types_1.LogLevel.Error);
        return span;
    });
}
exports.sendStartSpan = sendStartSpan;
/**
 * Send the TagSpan message to the agent message to the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutSpan} span - The original span
 * @param {String} name - The tag name
 * @param {String} value - The tag value
 * @returns {Promise<void>} A promise which resolves when the message has been
 */
function sendTagSpan(scout, span, name, value) {
    if (span.isIgnored()) {
        scout.log(`[scout] Skipping sending TagSpan for span [${span.id}] of ignored request [${span.requestId}]`, types_1.LogLevel.Warn);
        scout.emit(types_1.ScoutEvent.IgnoredRequestProcessingSkipped, span.requestId);
        return Promise.resolve();
    }
    const tagSpanReq = new Requests.V1TagSpan(name, value, span.id, span.requestId);
    return sendThroughAgent(scout, tagSpanReq)
        .then(() => undefined)
        .catch(err => {
        scout.log("[scout] failed to send tag span request", types_1.LogLevel.Error);
        return undefined;
    });
}
exports.sendTagSpan = sendTagSpan;
/**
 * Send the StopSpan message to the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {ScoutSpan} span - The original span
 * @returns {Promise<ScoutSpan>} the passed in request
 */
function sendStopSpan(scout, span) {
    if (span.isIgnored()) {
        scout.log(`[scout] Skipping sending StartSpan for span [${span.id}] of ignored request [${span.requestId}]`, types_1.LogLevel.Warn);
        scout.emit(types_1.ScoutEvent.IgnoredRequestProcessingSkipped, span.requestId);
        return Promise.resolve(span);
    }
    const stopSpanReq = new Requests.V1StopSpan(span.id, span.requestId, { timestamp: span.getEndTime() });
    return sendThroughAgent(scout, stopSpanReq)
        .then(() => span)
        .catch(err => {
        scout.log("[scout] failed to send stop span request", types_1.LogLevel.Error);
        return span;
    });
}
exports.sendStopSpan = sendStopSpan;
/**
 * Helper function for sending a given request through the agent
 *
 * @param {Scout} scout - A scout instance
 * @param {T extends BaseAgentRequest} msg - The message to send
 * @returns {Promise<T extends BaseAgentResponse>} resp - The message to send
 */
function sendThroughAgent(scout, msg, opts) {
    if (!scout.hasAgent()) {
        const err = new Errors.Disconnected("No agent is present, please run .setup()");
        scout.log(err.message, types_1.LogLevel.Error);
        return Promise.reject(err);
    }
    const agent = scout.getAgent();
    const config = scout.getConfig();
    if (!agent) {
        scout.log("[scout] agent is missing, cannot send", types_1.LogLevel.Warn);
        return Promise.reject(new Errors.NoAgentPresent());
    }
    if (!config.monitor) {
        scout.log("[scout] monitoring disabled, not sending tag request", types_1.LogLevel.Warn);
        return Promise.reject(new Errors.MonitoringDisabled());
    }
    if (opts && opts.async) {
        return agent.sendAsync(msg);
    }
    return agent.send(msg);
}
exports.sendThroughAgent = sendThroughAgent;
