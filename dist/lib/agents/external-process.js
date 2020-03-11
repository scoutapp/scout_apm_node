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
const DOMAIN_SOCKET_CREATE_BACKOFF_MS = 3000;
const DOMAIN_SOCKET_CONNECT_TIMEOUT_MS = 5000;
const DOMAIN_SOCKET_CREATE_ERR_THRESHOLD = 50;
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
                if (this.pool.isBorrowedResource(socket)) {
                    this.pool.release(socket);
                }
            }, err => { throw err; })
                .then(() => resolve());
        });
    }
    /** @see Agent */
    send(msg, socket) {
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
        // If provided with a socket use it, otherwise acquire one from the pool
        let getSocket = () => Promise.reject();
        if (socket) {
            getSocket = () => Promise.resolve(socket);
        }
        else {
            getSocket = () => new Promise((resolve, reject) => this.pool.acquire().then(resolve, reject));
        }
        // Build a promise to encapsulate the send
        const sendPromise = new Promise((resolve, reject) => {
            // Retrieve the socket (either direct or from pool)
            getSocket()
                .then((socket) => {
                // Avoiding sending registration messages on a socket which has already registered
                if (socket.registrationSent && requestType === types_1.AgentRequestType.V1Register) {
                    // Release the socket back into the pool
                    if (this.pool.isBorrowedResource(socket)) {
                        this.pool.release(socket);
                    }
                    if (!socket.registrationResp) {
                        return Promise.reject(new Errors.UnexpectedError("Missing registration resp on socket"));
                    }
                    return Promise.resolve(socket.registrationResp);
                }
                // Avoiding sending appMetadata messages on a socket which has already sent it
                if (socket.appMetadataSent
                    && requestType === types_1.AgentRequestType.V1ApplicationEvent
                    && "eventType" in msg
                    && msg.eventType === types_1.ApplicationEventType.ScoutMetadata) {
                    // Release the socket back into the pool
                    if (this.pool.isBorrowedResource(socket)) {
                        this.pool.release(socket);
                    }
                    if (!socket.appMetadataResp) {
                        return Promise.reject(new Errors.UnexpectedError("Missing app metadata resp on socket"));
                    }
                    return Promise.resolve(socket.appMetadataResp);
                }
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
                    if (this.pool.isBorrowedResource(socket)) {
                        this.pool.release(socket);
                    }
                };
                // Set up a listener on our own event emitter for the parsed socket response
                this.on(types_1.AgentEvent.SocketResponseReceived, listener);
                // If the socket fails, we'll likely never get to remove the listener (by running it) above,
                // so let's attach an onFailure to the socket that should be used if the socket fails elsewhere)
                socket.onFailure = () => {
                    this.removeListener(types_1.AgentEvent.SocketResponseReceived, listener);
                };
                // Send the message over the socket
                const result = socket.write(msg.toBinary());
                this.emit(types_1.AgentEvent.RequestSent, msg);
            });
        });
        return promise_timeout_1.timeout(sendPromise, DOMAIN_SOCKET_CONNECT_TIMEOUT_MS);
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
     * Set the registration and metadata that will be used by the agent
     * as the first thing to send whenever a connection is established
     *
     * @param {V1Register} registerMsg - Registration message
     * @param {V1ApplicationEvent} metadata - App metadata
     */
    setRegistrationAndMetadata(registerMsg, appMetadata) {
        this.registrationMsg = registerMsg;
        this.appMetadata = appMetadata;
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
                let socket;
                let registrationSent = false;
                let appMetadataSent = false;
                // If there is at least one pool error, let's wait a bit between creating domain sockets
                let maybeWait = () => Promise.resolve();
                if (this.poolErrors.length > DOMAIN_SOCKET_CREATE_ERR_THRESHOLD) {
                    maybeWait = () => types_1.waitMs(DOMAIN_SOCKET_CREATE_BACKOFF_MS);
                }
                return maybeWait()
                    .then(() => this.createDomainSocket())
                    // Save the socket, look for some metadata
                    .then(s => {
                    socket = s;
                    registrationSent = socket.registrationSent === true;
                    appMetadataSent = socket.appMetadataSent === true;
                })
                    // Once a socket is connected we must send the current registration & app metadata
                    .then(() => {
                    // Skip sending registration data if it's already been sent
                    // or there is no registration message registered yet
                    if (registrationSent || !this.registrationMsg) {
                        return;
                    }
                    this.logFn("Sending registration message for newly (re?)connected socket...", types_1.LogLevel.Debug);
                    return this.send(this.registrationMsg, socket)
                        .then(resp => {
                        socket.registrationSent = true;
                        socket.registrationResp = resp;
                    });
                })
                    .then(() => {
                    // Skip sending registration data if it's already been sent
                    // or there is no registration message registered yet
                    if (appMetadataSent || !this.appMetadata) {
                        return;
                    }
                    this.logFn("Sending appMetadata for newly (re?)connected socket...", types_1.LogLevel.Debug);
                    return this.send(this.appMetadata, socket)
                        .then(resp => {
                        socket.appMetadataSent = true;
                        socket.appMetadataResp = resp;
                    });
                })
                    // Once we've sent the registration & app metadata the socket is ready to use
                    .then(() => socket);
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
                this.emit(types_1.AgentEvent.SocketError, err);
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
        return new Promise((resolve) => {
            const chunks = Buffer.from([]);
            // Connect the socket
            const socket = net_1.createConnection(this.getSocketPath(), () => {
                this.emit(types_1.AgentEvent.SocketConnected);
                resolve(socket);
            });
            // Add handlers for socket management
            socket.on("data", (data) => this.handleSocketData(socket, data, chunks));
            socket.on("close", () => this.handleSocketClose(socket));
            socket.on("disconnect", () => this.handleSocketDisconnect(socket));
            socket.on("error", (err) => this.handleSocketError(socket, err));
        });
    }
    /**
     * Handle socket error
     *
     * @param {ScoutSocket} socket - socket enhanced with extra scout-related information
     * @param {Error} err - the error that occurred
     */
    handleSocketError(socket, err) {
        this.emit(types_1.AgentEvent.SocketError, err);
        this.logFn(`[scout/external-process] Socket connection error:\n${err}`, types_1.LogLevel.Error);
        // Run cleanup method
        if (socket.onFailure) {
            socket.onFailure();
        }
        // If an error occurrs on the socket, destroy the socket
        if (this.pool.isBorrowedResource(socket)) {
            this.pool.destroy(socket);
        }
    }
    /**
     * Handle a socket closure
     *
     * @param {ScoutSocket} socket - socket enhanced with extra scout-related information
     */
    handleSocketClose(socket) {
        this.logFn("[scout/external-process] Socket closed", types_1.LogLevel.Debug);
        // Run cleanup method
        if ("onFailure" in socket) {
            socket.onFailure();
        }
        // If the socket is closed, destroy the resource, removing it from the pool
        if (this.pool.isBorrowedResource(socket)) {
            this.pool.destroy(socket);
        }
        this.emit(types_1.AgentEvent.SocketDisconnected);
    }
    /**
     * Handle a socket disconnect
     *
     * @param {Socket} socket
     */
    handleSocketDisconnect(socket) {
        this.logFn("[scout/external-process] Socket disconnected", types_1.LogLevel.Debug);
        // Run cleanup method
        if ("onFailure" in socket) {
            socket.onFailure();
        }
        // If the socket has disconnected destroy & remove from pool
        if (this.pool.isBorrowedResource(socket)) {
            this.pool.destroy(socket);
        }
        this.emit(types_1.AgentEvent.SocketDisconnected);
    }
    /**
     * Process received socket data
     *
     * @param {ScoutSocket} socket - socket enhanced with extra scout-related information
     * @param {Buffer} data - data received over a socket
     * @param {Buffer} chunks - data left over from the previous reads of the socket
     */
    handleSocketData(socket, data, chunks) {
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
                if (this.pool.isBorrowedResource(socket)) {
                    this.pool.release(socket);
                }
                this.emit(types_1.AgentEvent.SocketResponseParseError, err);
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
