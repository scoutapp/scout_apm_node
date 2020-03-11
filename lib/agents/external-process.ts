import { EventEmitter } from "events";
import * as Errors from "../errors";
import * as Constants from "../constants";
import { pathExists, remove } from "fs-extra";
import { Socket, createConnection } from "net";
import { spawn, ChildProcess } from "child_process";
import { createPool, Pool } from "generic-pool";
import { timeout, TimeoutError } from "promise-timeout";

import {
    Agent,
    AgentEvent,
    AgentRequestType,
    AgentResponseType,
    AgentStatus,
    AgentType,
    ApplicationEventType,
    BaseAgentRequest,
    BaseAgentResponse,
    LogFn,
    LogLevel,
    ProcessOptions,
    splitAgentResponses,
    waitMs,
} from "../types";

import { V1AgentResponse, V1ApplicationEventResponse, V1RegisterResponse } from "../protocol/v1/responses";
import { V1Register, V1ApplicationEvent } from "../protocol/v1/requests";

const DOMAIN_SOCKET_CREATE_BACKOFF_MS = 3000;
const DOMAIN_SOCKET_CONNECT_TIMEOUT_MS = 5000;
const DOMAIN_SOCKET_CREATE_ERR_THRESHOLD = 5;

export interface ExtraSocketInfo {
    registrationSent?: boolean;
    registrationResp?: V1RegisterResponse;

    appMetadataSent?: boolean;
    appMetadataResp?: V1ApplicationEventResponse;

    doNotUse?: boolean;

    onFailure?: () => void;
}

export type ScoutSocket = Socket & ExtraSocketInfo;

export default class ExternalProcessAgent extends EventEmitter implements Agent {
    private readonly agentType: AgentType = AgentType.Process;
    private readonly opts: ProcessOptions;

    private pool: Pool<Socket>;
    private poolErrors: Error[] = [];
    private maxPoolErrors: number = 5;

    private socketConnected: boolean = false;
    private socketConnectionAttempts: number = 0;

    private detachedProcess: ChildProcess;
    private stopped: boolean = true;
    private logFn: LogFn;

    private registrationMsg: V1Register;
    private appMetadataMsg: V1ApplicationEvent;

    constructor(opts: ProcessOptions, logFn?: LogFn) {
        super();

        if (!opts || !ProcessOptions.isValid(opts)) {
            throw new Errors.UnexpectedError("Invalid ProcessOptions object");
        }
        this.opts = opts;

        this.logFn = logFn ? logFn : () => undefined;
    }

    /** @see Agent */
    public type(): Readonly<AgentType> { return this.agentType; }

    /** @see Agent */
    public options(): Readonly<ProcessOptions> { return Object.assign({}, this.opts); }

    /** @see Agent */
    public status(): Promise<AgentStatus> {
        if (!this.pool) { return Promise.resolve({connected: false}); }

        // Get the status of the agent (if connected)
        return Promise.resolve({
            connected: this.pool.min > 0 ? this.pool.available > 0 : true,
        });
    }

    /** @see Agent */
    public start(): Promise<this> {
        return pathExists(this.getSocketPath())
            .then(exists => {
                // If the socket doesn't already exist, start the process as configured
                if (exists) {
                    this.logFn("[scout/external-process] Socket already present", LogLevel.Warn);
                }

                return this.startProcess();
            });
    }

    /** @see Agent */
    public connect(): Promise<AgentStatus> {
        this.logFn("[scout/external-process] connecting to agent", LogLevel.Debug);

        // Initialize the pool if not already present
        return (this.pool ? Promise.resolve(this.pool) : this.initPool())
            .then(() => this.stopped = false)
            .then(() => this.status());
    }

    /** @see Agent */
    public disconnect(): Promise<AgentStatus> {
        if (!this.pool) { return this.status(); }

        // If disconnect is called ensure that no new sends get accepted
        this.stopped = true;

        return new Promise((resolve, reject) => {
            // :( generic-pool uses PromiseLike, and it's usage is *awkward*.
            this.pool
                .drain()
                .then(
                    () => this.pool.clear(),
                    err => { throw err; },
                )
                .then(
                    () => this.status(),
                    err => { throw err; },
                )
                .then(resolve);
        });
    }

    /** @see Agent */
    public sendAsync<T extends BaseAgentRequest>(msg: T): Promise<void> {
        if (!this.pool) { return Promise.reject(new Errors.Disconnected()); }

        this.logFn("[scout/external-process] sending async message", LogLevel.Debug);

        // Get a socket from the pool
        return new Promise((resolve, reject) => {
            this.pool.acquire()
                .then(
                    socket => {
                        socket.write(msg.toBinary());
                        this.emit(AgentEvent.RequestSent, msg);
                        if (this.pool.isBorrowedResource(socket)) { this.pool.release(socket); }
                    },
                    err => { throw err; },
                )
                .then(() => resolve());
        });
    }

    /** @see Agent */
    public send<T extends BaseAgentRequest, R extends BaseAgentResponse>(msg: T, socket?: ScoutSocket): Promise<R> {
        if (!this.pool) { return Promise.reject(new Errors.Disconnected()); }
        if (this.stopped) { return Promise.reject(new Errors.Disconnected()); }
        if (!msg) { return Promise.reject(new Errors.UnexpectedError("No message provided to send()")); }

        const requestType = msg.type;
        const isRegistrationMsg = requestType === AgentRequestType.V1Register;
        const isAppMetadataMsg = requestType === AgentRequestType.V1ApplicationEvent
            && "eventType" in msg
            && (msg as any).eventType === ApplicationEventType.ScoutMetadata;

        this.logFn(`[scout/external-process] sending message:\n ${JSON.stringify(msg.json)}`, LogLevel.Debug);

        // If provided with a socket use it, otherwise acquire one from the pool
        let getSocket: () => Promise<ScoutSocket> = () => Promise.reject();
        if (!socket || socket.doNotUse) {
            getSocket = () => new Promise((resolve, reject) => this.pool.acquire().then(resolve, reject));
        } else {
            getSocket = () => Promise.resolve(socket);
        }

        // Build a promise to encapsulate the send
        const sendPromise = new Promise((resolve, reject) => {
            // Retrieve the socket (either direct or from pool)
            getSocket()
            // If the socket has not had registration message sent yet, force sending of it
                .then((socket: ScoutSocket) => {
                    // If the registration has already been sent, don't do anything
                    if (socket.registrationSent) { return socket; }

                    // If the registration has not been sent but the message is a registration message, do nothing
                    if (!socket.registrationSent && isRegistrationMsg) { return socket; }

                    // If we're already *not* already registered and this message is *not* a registration msg,
                    // we need to send registration msg first
                    // or there is no registration message registered yet
                    this.logFn("Sending registration message for newly (re?)connected socket...", LogLevel.Debug);
                    return this.send(this.registrationMsg, socket)
                        .then(resp => {
                            socket.registrationSent = true;
                            socket.registrationResp = resp;
                            return socket;
                        });
                })
            // If the socket has not had the app metadata mesage sent yet, force sending of it
                .then((socket: ScoutSocket) => {
                    // We might end up here if registration hasn't been sent yet
                    if (!socket.registrationSent && isRegistrationMsg) { return socket; }

                    // If the app metadata has already been sent, don't do anything
                    if (socket.appMetadataSent) { return socket; }

                    // If the app metadata has not been sent but the message is an app metadata message, do nothing
                    if (!socket.appMetadataSent && isAppMetadataMsg) { return socket; }

                    // Force sending of app metadata message first
                    this.logFn("Sending app metadata message for newly (re?)connected socket...", LogLevel.Debug);
                    return this.send(this.appMetadataMsg, socket)
                        .then(resp => {
                            socket.appMetadataSent = true;
                            socket.appMetadataResp = resp;
                            return socket;
                        });
                })
            // Send whatever message has made it this far
                .then((socket: ScoutSocket) => {
                    // Set up a temporary listener to catch socket responses
                    const listener = (resp: any, socket?: ScoutSocket) => {
                        // Ensure we only capture messages that were received on the socket we're holding
                        if (!socket || socket !== socket) { return; }

                        this.logFn(
                            `[scout/external-process] received response: ${JSON.stringify(resp)}`,
                            LogLevel.Debug,
                        );

                        // Remove this temporary listener
                        this.removeListener(AgentEvent.SocketResponseReceived, listener);

                        // Release the socket back into the pool
                        if (this.pool.isBorrowedResource(socket)) {
                            if (isRegistrationMsg) {
                                socket.registrationSent = true;
                                socket.registrationResp = resp;
                            }

                            if (isAppMetadataMsg) {
                                socket.appMetadataSent = true;
                                socket.appMetadataResp = resp;
                            }

                            this.pool.release(socket);
                        }

                        // Resolve the encasing promise
                        resolve(resp);
                    };

                    // Set up a listener on our own event emitter for the parsed socket response
                    this.on(AgentEvent.SocketResponseReceived, listener);

                    // If the socket fails, we'll likely never get to remove the listener (by running it) above,
                    // so let's attach an onFailure to the socket that should be used if the socket fails elsewhere)
                    socket.onFailure = () => {
                        this.removeListener(AgentEvent.SocketResponseReceived, listener);
                    };

                    // Send the message over the socket
                    const result = socket.write(msg.toBinary());

                    this.emit(AgentEvent.RequestSent, msg);
                });
        });

        return timeout(sendPromise, DOMAIN_SOCKET_CONNECT_TIMEOUT_MS);
    }

    /**
     * Check if the process is present
     */
    public getProcess(): Promise<ChildProcess> {
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
    public stopProcess(): Promise<void> {
        return this.getProcess()
            .then(process => {
                this.stopped = true;
                process.kill();
            })
        // Remove the socket path
            .then(() => remove(this.getSocketPath()))
            .catch(err => {
                this.logFn(`[scout/external-process] Process stop failed:\n${err}`, LogLevel.Error);
            });
    }

    /**
     * Set the registration and metadata that will be used by the agent
     * as the first thing to send whenever a connection is established
     *
     * @param {V1Register} registerMsg - Registration message
     * @param {V1ApplicationEvent} metadata - App metadata
     */
    public setRegistrationAndMetadata(registerMsg: V1Register, appMetadataMsg: V1ApplicationEvent) {
        this.registrationMsg = registerMsg;
        this.appMetadataMsg = appMetadataMsg;
    }

    /**
     * Initialize the socket pool
     *
     * @returns {Promise<Pool<Socket>>} A promise that resolves to the socket pool
     */
    private initPool(): Promise<Pool<Socket>> {
        if (!this.opts.isDomainSocket()) {
            return Promise.reject(new Errors.NotSupported("Only domain sockets (file:// | unix://) are supported"));
        }

        this.pool = createPool({
            create: () => {
                // If there is at least one pool error, let's wait a bit between creating domain sockets
                let maybeWait = () => Promise.resolve();
                if (this.poolErrors.length > DOMAIN_SOCKET_CREATE_ERR_THRESHOLD) {
                    maybeWait = () => waitMs(DOMAIN_SOCKET_CREATE_BACKOFF_MS);
                }

                return maybeWait().then(() => this.createDomainSocket());
            },
            destroy: (socket: ScoutSocket) => {
                // Ensure the socket is not used again
                socket.doNotUse = true;

                return Promise.resolve(socket.destroy());
            },
            validate: (socket) => Promise.resolve(!socket.destroyed),
        });

        this.pool.on("factoryCreateError", err => {
            this.poolErrors.push(err);

            // If connection is refused X times we need to stop trying
            if ((err as any).code === "ECONNREFUSED") {
                const socketPath = this.getSocketPath();
                this.logFn(
                    `Socket connection failed, is core-agent running and listening at [${socketPath}]?`,
                    LogLevel.Error,
                );

                this.emit(AgentEvent.SocketError, err);
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
    private createDomainSocket(): Promise<Socket> {
        return new Promise((resolve) => {
            const chunks: Buffer = Buffer.from([]);

            // Connect the socket
            const socket = createConnection(this.getSocketPath(), () => {
                this.emit(AgentEvent.SocketConnected);
                resolve(socket);
            });

            // Add handlers for socket management
            socket.on("data", (data: Buffer) => this.handleSocketData(socket, data, chunks));
            socket.on("close", () => this.handleSocketClose(socket));
            socket.on("disconnect", () => this.handleSocketDisconnect(socket));
            socket.on("error", (err: Error) => this.handleSocketError(socket, err));
        });
    }

    /**
     * Handle socket error
     *
     * @param {ScoutSocket} socket - socket enhanced with extra scout-related information
     * @param {Error} err - the error that occurred
     */
    private handleSocketError(socket: ScoutSocket, err: Error) {
        this.emit(AgentEvent.SocketError, err);
        this.logFn(`[scout/external-process] Socket connection error:\n${err}`, LogLevel.Error);

        // Run cleanup method
        if (socket.onFailure) { socket.onFailure(); }

        // Ensure the socket is not used again
        socket.doNotUse = true;

        // If an error occurrs on the socket, destroy the socket
        if (this.pool.isBorrowedResource(socket)) {
            this.pool.destroy(socket);
            this.pool.clear();
        }
    }

    /**
     * Handle a socket closure
     *
     * @param {ScoutSocket} socket - socket enhanced with extra scout-related information
     */
    private handleSocketClose(socket: ScoutSocket) {
        this.logFn("[scout/external-process] Socket closed", LogLevel.Debug);

        // Run cleanup method
        if ("onFailure" in socket) { (socket as any).onFailure(); }

        // Ensure the socket is not used again in a direct context (ex. `send(msg, socket)`)
        socket.doNotUse = true;

        // If the socket is closed, destroy the resource, removing it from the pool
        if (this.pool.isBorrowedResource(socket)) {
            this.pool.destroy(socket);
        }

        this.pool.clear();

        this.emit(AgentEvent.SocketDisconnected);
    }

    /**
     * Handle a socket disconnect
     *
     * @param {Socket} socket
     */
    private handleSocketDisconnect(socket: ScoutSocket) {
        this.logFn("[scout/external-process] Socket disconnected", LogLevel.Debug);

        // Run cleanup method
        if ("onFailure" in socket) { (socket as any).onFailure(); }

        // Ensure the socket is not used again
        socket.doNotUse = true;

        // If the socket has disconnected destroy & remove from pool
        if (this.pool.isBorrowedResource(socket)) { this.pool.destroy(socket); }

        this.emit(AgentEvent.SocketDisconnected);
    }

    /**
     * Process received socket data
     *
     * @param {ScoutSocket} socket - socket enhanced with extra scout-related information
     * @param {Buffer} data - data received over a socket
     * @param {Buffer} chunks - data left over from the previous reads of the socket
     */
    private handleSocketData(socket: ScoutSocket, data: Buffer, chunks: Buffer) {
        let framed: Buffer[] = [];

        // Parse the buffer to return zero or more well-framed agent responses
        const {framed: newFramed, remaining: newRemaining} = splitAgentResponses(data);
        framed = framed.concat(newFramed);

        // Add the remaining to the partial response buffer we're keeping
        chunks = Buffer.concat([chunks, newRemaining]);

        // Attempt to extract any *just* completed messages
        // Update the partial response for any remaining
        const {framed: chunkFramed, remaining: chunkRemaining} = splitAgentResponses(chunks);
        framed = framed.concat(chunkFramed);
        chunks = chunkRemaining;

        // Read all (likely) fully formed, correctly framed messages
        framed
            .forEach(data => {
                // Attempt to parse an agent response
                V1AgentResponse
                    .fromBinary(data)
                    .then(msg => {
                        this.emit(AgentEvent.SocketResponseReceived, msg, socket);

                        switch (msg.type) {
                            case AgentResponseType.V1StartRequest:
                                this.emit(AgentEvent.RequestStarted);
                                break;
                            case AgentResponseType.V1FinishRequest:
                                this.emit(AgentEvent.RequestFinished);
                                break;
                            case AgentResponseType.V1StartSpan:
                                this.emit(AgentEvent.SpanStarted);
                                break;
                            case AgentResponseType.V1StopSpan:
                                this.emit(AgentEvent.SpanStopped);
                                break;
                            case AgentResponseType.V1ApplicationEvent:
                                this.emit(AgentEvent.ApplicationEventReported);
                                break;
                        }
                    })
                    .catch(err => {
                        this.logFn(
                            `[scout/external-process] Socket response parse error:\n ${err}`,
                            LogLevel.Error,
                        );

                        if (this.pool.isBorrowedResource(socket)) { this.pool.release(socket); }
                        this.emit(AgentEvent.SocketResponseParseError, err);
                    });
            });
    }

    // Get the path for the socket
    private getSocketPath(): string {
        if (!this.opts.isDomainSocket()) {
            return this.opts.uri;
        }

        return this.opts.uri.replace(Constants.DOMAIN_SOCKET_URI_SCHEME_RGX, "");
    }

    // Helper for retrieving generic-pool stats
    private getPoolStats(): object {
        if (!this.pool) { return {}; }
        return {
            pending: this.pool.pending,
            max: this.pool.max,
            min: this.pool.min,
        };
    }

     // Start a detached process with the configured scout-agent binary
    private startProcess(): Promise<this> {
        // If core agent launching has been disabled, don't start the process
        if (this.opts.disallowLaunch) {
            // disallowing should presume that there is *another* agent already running.
            this.logFn(
                "[scout/external-process] Not attempting to launch Core Agent due to 'core_agent_launch' setting.",
                LogLevel.Debug,
            );
            return Promise.reject(new Errors.AgentLaunchDisabled());
        }

        // Build command and arguments
        const socketPath = this.getSocketPath();
        const args = ["start", "--socket", socketPath];
        if (this.opts.logFilePath) { args.push("--log-file", this.opts.logFilePath); }
        if (this.opts.configFilePath) { args.push("--config-file", this.opts.configFilePath); }
        if (this.opts.logLevel) { args.push("--log-level", this.opts.logLevel); }

        this.logFn(`[scout/external-process] binary path: [${this.opts.binPath}]`, LogLevel.Debug);
        this.logFn(`[scout/external-process] args: [${args}]`, LogLevel.Debug);
        this.detachedProcess = spawn(this.opts.binPath, args, {
            detached: true,
            stdio: "ignore",
        });
        this.detachedProcess.unref();

        // Wait until process is listening on the given socket port
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                pathExists(socketPath)
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
