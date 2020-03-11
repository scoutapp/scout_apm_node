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

import { V1AgentResponse } from "../protocol/v1/responses";
import { V1Register, V1ApplicationEvent } from "../protocol/v1/requests";

const DOMAIN_SOCKET_CREATE_BACKOFF_MS = 5000;

export default class ExternalProcessAgent extends EventEmitter implements Agent {
    private readonly agentType: AgentType = AgentType.Process;
    private readonly opts: ProcessOptions;

    private pool: Pool<Socket>;
    private poolErrors: Error[] = [];
    private maxPoolErrors: number = 5;
    private poolDisabled: boolean = false;

    private socketConnected: boolean = false;
    private socketConnectionAttempts: number = 0;

    private detachedProcess: ChildProcess;
    private stopped: boolean = true;
    private logFn: LogFn;

    private registrationMsg: V1Register;
    private appMetadata: V1ApplicationEvent;

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
    public send<T extends BaseAgentRequest, R extends BaseAgentResponse>(msg: T, socket?: Socket): Promise<R> {
        if (!this.pool) { return Promise.reject(new Errors.Disconnected()); }
        if (this.stopped) { return Promise.reject(new Errors.Disconnected()); }
        if (!msg) { return Promise.reject(new Errors.UnexpectedError("No message provided to send()")); }
        const requestType = msg.type;

        this.logFn(`[scout/external-process] sending message:\n ${JSON.stringify(msg.json)}`, LogLevel.Debug);

        // If provided with a socket use it, otherwise acquire one from the pool
        let getSocket: () => Promise<Socket> = () => Promise.reject();
        if (socket) {
            getSocket = () => Promise.resolve(socket);
        } else {
            getSocket = () => new Promise((resolve, reject) => this.pool.acquire().then(resolve, reject));
        }

        // Build a promise to encapsulate the send
        const sendPromise = new Promise((resolve, reject) => {
            // Retrieve the socket (either direct or from pool)
            getSocket()
                .then((socket: Socket) => {
                    // Avoiding sending registration messages on a socket which has already registered
                    if ((socket as any).registrationSent && requestType === AgentRequestType.V1Register) {
                        console.log("AVOIDING RESEND OF V1REGISTER");
                        // Release the socket back into the pool
                        if (this.pool.isBorrowedResource(socket)) { this.pool.release(socket); }
                        return Promise.resolve((socket as any).registrationResp);
                    }

                    // Avoiding sending appMetadata messages on a socket which has already sent it
                    if ((socket as any).appMetadataSent
                        && requestType === AgentRequestType.V1ApplicationEvent
                        && "eventType" in msg
                        && msg["eventType"] === ApplicationEventType.ScoutMetadata) {
                        console.log("AVOIDING RESEND OF APPMETA");
                        // Release the socket back into the pool
                        if (this.pool.isBorrowedResource(socket)) { this.pool.release(socket); }
                        return Promise.resolve((socket as any).appMetadataResp);
                    }

                    // Set up a temporary listener to catch socket responses
                    const listener = (resp: any, socket?: Socket) => {
                        // Ensure we only capture messages that were received on the socket we're holding
                        if (!socket || socket !== socket) { return; }

                        this.logFn(
                            `[scout/external-process] received response: ${JSON.stringify(resp)}`,
                            LogLevel.Debug,
                        );

                        // Remove this temporary listener
                        this.removeListener(AgentEvent.SocketResponseReceived, listener);

                        // Resolve the encasing promise
                        resolve(resp);

                        // Release the socket back into the pool
                        if (this.pool.isBorrowedResource(socket)) { this.pool.release(socket); }
                    };

                    // Set up a listener on our own event emitter for the parsed socket response
                    this.on(AgentEvent.SocketResponseReceived, listener);

                    // If the socket fails, we'll likely never get to remove the listener (by running it) above,
                    // so let's attach an onFailure to the socket that should be used if the socket fails elsewhere)
                    (socket as any).onFailure = () => {
                        this.removeListener(AgentEvent.SocketResponseReceived, listener);
                    };

                    // Send the message over the socket
                    const result = socket.write(msg.toBinary());

                    this.emit(AgentEvent.RequestSent, msg);
                    return result;
                });
        });

        return timeout(sendPromise, DOMAIN_SOCKET_CREATE_BACKOFF_MS * 2);
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
    public setRegistrationAndMetadata(registerMsg: V1Register, appMetadata: V1ApplicationEvent) {
        this.registrationMsg = registerMsg;
        this.appMetadata = appMetadata;
    }

    /**
     * Send a single message over a given connected socket
     *
     * @param {Socket} socket - The connected socket over which to send the message
     * @param {BaseAgentRequest} msg - The message to send
     * @returns {Promise<R extends BaseAgentResponse>} A promise that evalua
     */
    public sendSingle<T extends BaseAgentRequest, R extends BaseAgentResponse>(socket: Socket, msg: T): Promise<{socket: Socket, response: R}> {


        return Promise.reject();
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
                // If the pool is disabled we need to disconnect it and
                if (this.poolDisabled) {
                    return this.disconnect()
                        .then(() => Promise.reject(new Errors.ConnectionPoolDisabled()));
                }

                let socket;
                let registrationSent = false;
                let appMetadataSent = false;

                // If there is at least one pool error, let's wait a bit between creating domain sockets
                return waitMs(this.poolErrors.length > 0 ? DOMAIN_SOCKET_CREATE_BACKOFF_MS : 0)
                    .then(() => this.createDomainSocket())
                // Save the socket, look for some metadata
                    .then(s => {
                        socket = s;
                        registrationSent = (socket as any).registrationSent === true;
                        appMetadataSent = (socket as any).appMetadataSent === true;
                    })
                // Once a socket is connected we must send the current registration & app metadata
                    .then(() => {
                        // Skip sending registration data if it's already been sent
                        // or there is no registration message registered yet
                        if (registrationSent || !this.registrationMsg) { return; }

                        this.logFn("Sending registration message for newly (re?)connected socket...", LogLevel.Debug);
                        return this.send(this.registrationMsg, socket)
                            .then(resp => {
                                (socket as any).registrationSent = true;
                                (socket as any).registrationResp = resp;
                            });
                    })
                    .then(() => (socket as any).registered = true)
                    .then(() => {
                        // Skip sending registration data if it's already been sent
                        // or there is no registration message registered yet
                        if (appMetadataSent || !this.appMetadata) { return; }

                        this.logFn("Sending appMetadata for newly (re?)connected socket...", LogLevel.Debug)
                        return this.send(this.appMetadata, socket)
                            .then(resp => {
                                (socket as any).appMetadataSent = true;
                                (socket as any).appMetadataResp = resp;
                            });
                    })
                    .then(() => (socket as any).registered = true)
                // Once we've sent the registration & app metadata the socket is ready to use
                    .then(() => socket);

            },
            destroy: (socket) => Promise.resolve(socket.destroy()),
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
            let chunks: Buffer = Buffer.from([]);

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
     * @param {Socket} socket
     * @param {Error} err - the error that occurred
     */
    private handleSocketError(socket: Socket, err: Error) {
        this.emit(AgentEvent.SocketError, err);
        this.logFn(`[scout/external-process] Socket connection error:\n${err}`, LogLevel.Error);

        // Run cleanup method
        if ("onFailure" in socket) { (socket as any).onFailure(); }

        // If an error occurrs on the socket, destroy the socket
        if (this.pool.isBorrowedResource(socket)) { this.pool.destroy(socket); }
    }

    /**
     * Handle a socket closure
     *
     * @param {Socket} socket
     */
    private handleSocketClose(socket: Socket) {
        this.logFn("[scout/external-process] Socket closed", LogLevel.Debug);

        // Run cleanup method
        if ("onFailure" in socket) { (socket as any).onFailure(); }

        // If the socket is closed, destroy the resource, removing it from the pool
        if (this.pool.isBorrowedResource(socket)) { this.pool.destroy(socket); }

        this.emit(AgentEvent.SocketDisconnected);
    }

    /**
     * Handle a socket disconnect
     *
     * @param {Socket} socket
     */
    private handleSocketDisconnect(socket: Socket) {
        this.logFn("[scout/external-process] Socket disconnected", LogLevel.Debug);

        // Run cleanup method
        if ("onFailure" in socket) { (socket as any).onFailure(); }

        // If the socket has disconnected destroy & remove from pool
        if (this.pool.isBorrowedResource(socket)) { this.pool.destroy(socket); }

        this.emit(AgentEvent.SocketDisconnected);
    }

    /**
     * Process received socket data
     *
     * @param {Socket} socket - The socket the data was received over
     * @param {Buffer} data - data received over a socket
     * @param {Buffer} chunks - data left over from the previous reads of the socket
     */
    private handleSocketData(socket: Socket, data: Buffer, chunks: Buffer) {
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
