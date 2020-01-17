"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const Errors = require("../errors");
const Constants = require("../constants");
const fs_extra_1 = require("fs-extra");
const net_1 = require("net");
const child_process_1 = require("child_process");
const generic_pool_1 = require("generic-pool");
const promise_timeout_1 = require("promise-timeout");
const types_1 = require("../types");
const responses_1 = require("../protocol/v1/responses");
class ExternalProcessAgent extends events_1.EventEmitter {
    constructor(opts, logFn) {
        super();
        this.agentType = types_1.AgentType.Process;
        this.poolErrors = [];
        this.maxPoolErrors = 5;
        this.poolDisabled = false;
        this.socketConnected = false;
        this.socketConnectionAttempts = 0;
        this.stopped = true;
        if (!opts || !types_1.ProcessOptions.isValid(opts)) {
            throw new Errors.UnexpectedError("Invalid ProcessOptions object");
        }
        this.opts = opts;
        this.logFn = logFn ? logFn : () => undefined;
    }
    /** @see Agent */
    type() { return this.agentType; }
    /** @see Agent */
    options() { return Object.assign({}, this.opts); }
    /** @see Agent */
    status() {
        if (!this.pool) {
            return Promise.resolve({ connected: false });
        }
        // Get the status of the agent (if connected)
        return Promise.resolve({
            connected: this.pool.min > 0 ? this.pool.available > 0 : true,
        });
    }
    /** @see Agent */
    start() {
        return fs_extra_1.pathExists(this.getSocketPath())
            .then(exists => {
            // If the socket doesn't already exist, start the process as configured
            if (exists) {
                this.logFn("[scout/external-process] Socket already present", types_1.LogLevel.Warn);
            }
            return this.startProcess();
        });
    }
    /** @see Agent */
    connect() {
        this.logFn("[scout/external-process] connecting to agent", types_1.LogLevel.Debug);
        // Initialize the pool if not already present
        return (this.pool ? Promise.resolve(this.pool) : this.initPool())
            .then(() => this.stopped = false)
            .then(() => this.status());
    }
    /** @see Agent */
    disconnect() {
        if (!this.pool) {
            return this.status();
        }
        // If disconnect is called ensure that no new sends get accepted
        this.stopped = true;
        return new Promise((resolve, reject) => {
            // :( generic-pool uses PromiseLike, and it's usage is *awkward*.
            this.pool
                .drain()
                .then(() => this.pool.clear(), err => { throw err; })
                .then(() => this.status(), err => { throw err; })
                .then(resolve);
        });
    }
    /** @see Agent */
    sendAsync(msg) {
        if (!this.pool) {
            return Promise.reject(new Errors.Disconnected());
        }
        this.logFn("[scout/external-process] sending async message", types_1.LogLevel.Debug);
        // Get a socket from the pool
        return new Promise((resolve, reject) => {
            this.pool.acquire()
                .then(socket => {
                socket.write(msg.toBinary());
                this.emit(types_1.AgentEvent.RequestSent, msg);
                return this.pool.release(socket);
            }, err => { throw err; })
                .then(() => resolve());
        });
    }
    /** @see Agent */
    send(msg) {
        if (!this.pool) {
            return Promise.reject(new Errors.Disconnected());
        }
        if (this.stopped) {
            return Promise.reject(new Errors.Disconnected());
        }
        if (!msg) {
            return Promise.reject(new Errors.UnexpectedError("No message provided to send()"));
        }
        const requestType = msg.type;
        this.logFn(`[scout/external-process] sending message:\n ${JSON.stringify(msg.json)}`, types_1.LogLevel.Debug);
        const sendPromise = new Promise((resolve, reject) => {
            // Get a socket from the pool
            this.pool
                .acquire()
                .then(
            // Socket acquisition succeeded
            (socket) => {
                // Set up a temporary listener to catch socket responses
                const listener = (resp, socket) => {
                    // Ensure we only capture messages that were received on the socket we're holding
                    if (!socket || socket !== socket) {
                        return;
                    }
                    this.logFn(`[scout/external-process] received response: ${JSON.stringify(resp)}`, types_1.LogLevel.Debug);
                    // Remove this temporary listener
                    this.removeListener(types_1.AgentEvent.SocketResponseReceived, listener);
                    // Resolve the encasing promise
                    resolve(resp);
                    // Release the socket back into the pool
                    this.pool.release(socket);
                };
                // Set up a listener on our own event emitter for the parsed socket response
                this.on(types_1.AgentEvent.SocketResponseReceived, listener);
                // Send the message over the socket
                const result = socket.write(msg.toBinary());
                this.emit(types_1.AgentEvent.RequestSent, msg);
                return result;
            }, 
            // Socket acquisition failed
            err => { throw err; });
        });
        return promise_timeout_1.timeout(sendPromise, 5000);
    }
    /**
     * Check if the process is present
     */
    getProcess() {
        if (this.opts.disallowLaunch) {
            return Promise.reject(new Errors.NoProcessReference("launch disabled"));
        }
        if (this.detachedProcess === undefined || this.detachedProcess === null) {
            return Promise.reject(new Errors.NoProcessReference());
        }
        return Promise.resolve(this.detachedProcess);
    }
    /**
     * Stop the process (if one is running)
     */
    stopProcess() {
        return this.getProcess()
            .then(process => {
            this.stopped = true;
            process.kill();
        })
            // Remove the socket path
            .then(() => fs_extra_1.remove(this.getSocketPath()))
            .catch(err => {
            this.logFn(`[scout/external-process] Process stop failed:\n${err}`, types_1.LogLevel.Error);
        });
    }
    /**
     * Initialize the socket pool
     *
     * @returns {Promise<Pool<Socket>>} A promise that resolves to the socket pool
     */
    initPool() {
        if (!this.opts.isDomainSocket()) {
            return Promise.reject(new Errors.NotSupported("Only domain sockets (file:// | unix://) are supported"));
        }
        this.pool = generic_pool_1.createPool({
            create: () => {
                // If the pool is disabled we need to disconnect it and
                if (this.poolDisabled) {
                    return this.disconnect()
                        .then(() => Promise.reject(new Errors.ConnectionPoolDisabled()));
                }
                return this.createDomainSocket();
            },
            destroy: (socket) => Promise.resolve(socket.destroy()),
            validate: (socket) => Promise.resolve(!socket.destroyed),
        });
        this.pool.on("factoryCreateError", err => {
            this.poolErrors.push(err);
            // If connection is refused X times we need to stop trying
            if (err.code === "ECONNREFUSED") {
                const socketPath = this.getSocketPath();
                this.logFn(`Socket connection failed, is core-agent running and listening at [${socketPath}]?`, types_1.LogLevel.Error);
                // In the case that connection fails repeatedly we'll need to stop trying
                if (this.poolErrors.length > this.maxPoolErrors) {
                    this.logFn("maxPoolErrors reached on a refused connection error, disabling pool...", types_1.LogLevel.Error);
                    this.poolDisabled = true;
                    this.emit(types_1.AgentEvent.SocketError, err);
                }
            }
            // If the agent is supposedly running, but connection fails too many times for any reason
            if (!this.stopped && this.poolErrors.length > this.maxPoolErrors) {
                this.emit("error", new Errors.ResourceAllocationFailureLimitExceeded());
                this.disconnect();
            }
        });
        return Promise.resolve(this.pool);
    }
    /**
     * Create a socket to the agent for sending requests
     *
     * NOTE: this method *must* police itself, if it fails too many times
     *
     * @returns {Promise<Socket>} A socket for use in  the socket pool
     */
    createDomainSocket() {
        return new Promise((resolve, reject) => {
            let chunks = Buffer.from([]);
            const socket = net_1.createConnection(this.getSocketPath(), () => {
                this.emit(types_1.AgentEvent.SocketConnected);
                resolve(socket);
            });
            // When the socket receives data, parse it and emit socket response received
            socket.on("data", (data) => {
                let framed = [];
                // Parse the buffer to return zero or more well-framed agent responses
                const { framed: newFramed, remaining: newRemaining } = types_1.splitAgentResponses(data);
                framed = framed.concat(newFramed);
                // Add the remaining to the partial response buffer we're keeping
                chunks = Buffer.concat([chunks, newRemaining]);
                // Attempt to extract any *just* completed messages
                // Update the partial response for any remaining
                const { framed: chunkFramed, remaining: chunkRemaining } = types_1.splitAgentResponses(chunks);
                framed = framed.concat(chunkFramed);
                chunks = chunkRemaining;
                // Read all (likely) fully formed, correctly framed messages
                framed
                    .forEach(data => {
                    // Attempt to parse an agent response
                    responses_1.V1AgentResponse
                        .fromBinary(data)
                        .then(msg => {
                        this.emit(types_1.AgentEvent.SocketResponseReceived, msg, socket);
                        switch (msg.type) {
                            case types_1.AgentResponseType.V1StartRequest:
                                this.emit(types_1.AgentEvent.RequestStarted);
                                break;
                            case types_1.AgentResponseType.V1FinishRequest:
                                this.emit(types_1.AgentEvent.RequestFinished);
                                break;
                            case types_1.AgentResponseType.V1StartSpan:
                                this.emit(types_1.AgentEvent.SpanStarted);
                                break;
                            case types_1.AgentResponseType.V1StopSpan:
                                this.emit(types_1.AgentEvent.SpanStopped);
                                break;
                            case types_1.AgentResponseType.V1ApplicationEvent:
                                this.emit(types_1.AgentEvent.ApplicationEventReported);
                                break;
                        }
                    })
                        .catch(err => {
                        this.logFn(`[scout/external-process] Socket response parse error:\n ${err}`, types_1.LogLevel.Error);
                        this.emit(types_1.AgentEvent.SocketResponseParseError, err);
                    });
                });
            });
            // When socket closes emit information regarding closure
            socket.on("close", () => {
                this.logFn("[scout/external-process] Socket closed", types_1.LogLevel.Debug);
                this.emit(types_1.AgentEvent.SocketDisconnected);
            });
            socket.on("error", (err) => {
                this.emit(types_1.AgentEvent.SocketError, err);
                this.logFn(`[scout/external-process] Socket connection error:\n${err}`, types_1.LogLevel.Error);
                reject(err);
            });
        });
    }
    // Get the path for the socket
    getSocketPath() {
        if (!this.opts.isDomainSocket()) {
            return this.opts.uri;
        }
        return this.opts.uri.replace(Constants.DOMAIN_SOCKET_URI_SCHEME_RGX, "");
    }
    // Start a detached process with the configured scout-agent binary
    startProcess() {
        // If core agent launching has been disabled, don't start the process
        if (this.opts.disallowLaunch) {
            // disallowing should presume that there is *another* agent already running.
            this.logFn("[scout/external-process] Not attempting to launch Core Agent due to 'core_agent_launch' setting.", types_1.LogLevel.Debug);
            return Promise.reject(new Errors.AgentLaunchDisabled());
        }
        // Build command and arguments
        const socketPath = this.getSocketPath();
        const args = ["start", "--socket", socketPath];
        if (this.opts.logFilePath) {
            args.push("--log-file", this.opts.logFilePath);
        }
        if (this.opts.configFilePath) {
            args.push("--config-file", this.opts.configFilePath);
        }
        if (this.opts.logLevel) {
            args.push("--log-level", this.opts.logLevel);
        }
        this.logFn(`[scout/external-process] binary path: [${this.opts.binPath}]`, types_1.LogLevel.Debug);
        this.logFn(`[scout/external-process] args: [${args}]`, types_1.LogLevel.Debug);
        this.detachedProcess = child_process_1.spawn(this.opts.binPath, args, {
            detached: true,
            stdio: "ignore",
        });
        this.detachedProcess.unref();
        // Wait until process is listening on the given socket port
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                fs_extra_1.pathExists(socketPath)
                    .then(exists => {
                    if (exists) {
                        this.stopped = false;
                        resolve(this);
                    }
                })
                    .catch(reject);
            }, Constants.DEFAULT_BIN_STARTUP_WAIT_MS);
        });
    }
}
exports.default = ExternalProcessAgent;
