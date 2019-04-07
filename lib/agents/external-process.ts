import { EventEmitter } from "events";
import * as Errors from "../errors";
import * as Constants from "../constants";
import { pathExists, remove } from "fs-extra";
import { Socket, createConnection } from "net";
import { spawn, ChildProcess } from "child_process";
import { createPool, Pool } from "generic-pool";

import {
    Agent,
    AgentEvent,
    AgentRequest,
    AgentRequestType,
    AgentResponse,
    AgentResponseType,
    AgentStatus,
    AgentType,
    ProcessOptions,
    LogFn,
    LogLevel,
} from "../types";

import { V1AgentResponse } from "../protocol/v1/responses";

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
                if (!exists) { return this.startProcess(); }
                this.logFn("Socket already present", LogLevel.Warn);
                return this;
            });
    }

    /** @see Agent */
    public connect(): Promise<AgentStatus> {
        // Initialize the pool if not already present
        return (this.pool ? Promise.resolve(this.pool) : this.initPool())
            .then(() => this.status());
    }

    /** @see Agent */
    public disconnect(): Promise<AgentStatus> {
        if (!this.pool) { return this.status(); }

        return new Promise((resolve, reject) => {
            // :( generic-pool uses PromiseLike, and it's usage is *awkward*.
            this.pool.drain()
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
    public sendAsync<T extends AgentRequest>(msg: T): Promise<void> {
        if (!this.pool) { return Promise.reject(new Errors.Disconnected()); }

        // Get a socket from the pool
        return new Promise((resolve, reject) => {
            this.pool.acquire()
                .then(
                    socket => {
                        socket.write(msg.toBinary());
                        return this.pool.release(socket);
                    },
                    err => { throw err; },
                )
                .then(() => resolve());
        });
    }

    /** @see Agent */
    public send<T extends AgentRequest>(msg: T): Promise<AgentResponse> {
        if (!this.pool) { return Promise.reject(new Errors.Disconnected()); }
        if (!msg) { return Promise.reject(new Errors.UnexpectedError("No message provided to send()")); }
        const requestType = msg.type;

        // Application events must be sent uing `sendAsync`
        if (requestType === AgentRequestType.V1ApplicationEvent) {
            throw new Errors.RequestDoesNotPromptResponse(
                "ApplicationEvents do not produce responses, please use `sendAsync` instead",
            );
        }

        return new Promise((resolve, reject) => {
            // Get a socket from the pool
            this.pool.acquire()
                .then(
                    // Socket acquisition succeeded
                    (socket: Socket) => {
                        // Set up a temporary listener to catch socket responses
                        const listener = (resp: any, socket?: Socket) => {
                            // Ensure we only capture messages that were received on the socket we're holding
                            if (!socket || socket !== socket) { return; }

                            // Remove this temporary listener
                            this.removeListener(AgentEvent.SocketResponseReceived, listener);

                            // Resolve the encasing promise
                            resolve(resp);

                            // Release the socket back into the pool
                            this.pool.release(socket);
                        };

                        // Set up a listener on our own event emitter for the parsed socket response
                        this.on(AgentEvent.SocketResponseReceived, listener);

                        // Send the message over the socket
                        return socket.write(msg.toBinary());
                    },

                    // Socket acquisition failed
                    err => { throw err; },
                );
        });
    }

    /**
     * Check if the process is present
     */
    public getProcess(): Promise<ChildProcess> {
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
            .then(() => remove(this.getSocketPath()));
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
            create: () => this.createDomainSocket(),
            destroy: (socket) => Promise.resolve(socket.destroy()),
            validate: (socket) => Promise.resolve(!socket.destroyed),
        });

        this.pool.on("factoryCreateError", err => {
            this.poolErrors.push(err);

            // Stop the pool if it fails too many times (and the agent is not stopped)
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
    private createDomainSocket(): Promise<Socket> {
        return new Promise((resolve, reject) => {
            const socket = createConnection(this.getSocketPath(), () => {
                this.emit(AgentEvent.SocketConnected);
                resolve(socket);
            });

            // When the socket receives data, parse it and emit socket response received
            socket.on("data", (data: Buffer) => {
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
                        this.logFn(`Socket response parse error:\n ${err}`, LogLevel.Error);
                        this.emit(AgentEvent.SocketResponseParseError, err);
                    });
            });

            // When socket closes emit information regarding closure
            socket.on("close", () => {
                this.logFn("Socket closed", LogLevel.Debug);
                this.emit(AgentEvent.SocketDisconnected);
            });

            socket.on("error", err => {
                this.emit(AgentEvent.SocketError, err);
                this.logFn(`Socket connection error:\n${err}`, LogLevel.Error);
                reject(err);
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
        // Build command and arguments
        const socketPath = this.getSocketPath();
        const args = ["start", "--socket", socketPath];
        if (this.opts.logFilePath) { args.push("--log-file", this.opts.logFilePath); }
        if (this.opts.configFilePath) { args.push("--config-file", this.opts.configFilePath); }
        if (this.opts.logLevel) { args.push("--log-file", this.opts.logLevel); }

        this.logFn(`Child process command binary path: [${this.opts.binPath}]`, LogLevel.Debug);
        this.logFn(`Child process command args: [${args}]`, LogLevel.Debug);
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
