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
    BaseAgentRequest,
    AgentRequestType,
    BaseAgentResponse,
    AgentResponseType,
    AgentStatus,
    AgentType,
    ProcessOptions,
    LogFn,
    LogLevel,
    splitAgentResponses,
} from "../types";

import { V1AgentResponse } from "../protocol/v1/responses";

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
            .then(() => this.status());
    }

    /** @see Agent */
    public disconnect(): Promise<AgentStatus> {
        if (!this.pool) { return this.status(); }
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
                        return this.pool.release(socket);
                    },
                    err => { throw err; },
                )
                .then(() => resolve());
        });
    }

    /** @see Agent */
    public send<T extends BaseAgentRequest, R extends BaseAgentResponse>(msg: T): Promise<R> {
        if (!this.pool) { return Promise.reject(new Errors.Disconnected()); }
        if (!msg) { return Promise.reject(new Errors.UnexpectedError("No message provided to send()")); }
        const requestType = msg.type;

        this.logFn(`[scout/external-process] sending message:\n ${JSON.stringify(msg.json)}`, LogLevel.Debug);

        return new Promise((resolve, reject) => {
            // Get a socket from the pool
            this.pool
                .acquire()
                .then(
                    // Socket acquisition succeeded
                    (socket: Socket) => {
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
                            this.pool.release(socket);
                        };

                        // Set up a listener on our own event emitter for the parsed socket response
                        this.on(AgentEvent.SocketResponseReceived, listener);

                        // Send the message over the socket
                        const result = socket.write(msg.toBinary());

                        this.emit(AgentEvent.RequestSent, msg);
                        return result;
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

                return this.createDomainSocket();
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

                // In the case that connection fails repeatedly we'll need to stop trying
                if (this.poolErrors.length > this.maxPoolErrors) {
                    this.logFn(
                        "maxPoolErrors reached on a refused connection error, disabling pool...",
                        LogLevel.Error,
                    );
                    this.poolDisabled = true;
                    this.emit(AgentEvent.SocketError, err);
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
    private createDomainSocket(): Promise<Socket> {
        return new Promise((resolve, reject) => {
            let chunks: Buffer = Buffer.from([]);

            const socket = createConnection(this.getSocketPath(), () => {
                this.emit(AgentEvent.SocketConnected);
                resolve(socket);
            });

            // When the socket receives data, parse it and emit socket response received
            socket.on("data", (data: Buffer) => {
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
                                this.emit(AgentEvent.SocketResponseParseError, err);
                            });
                    });
            });

            // When socket closes emit information regarding closure
            socket.on("close", () => {
                this.logFn("[scout/external-process] Socket closed", LogLevel.Debug);
                this.emit(AgentEvent.SocketDisconnected);
            });

            socket.on("error", (err: Error) => {
                this.emit(AgentEvent.SocketError, err);
                this.logFn(`[scout/external-process] Socket connection error:\n${err}`, LogLevel.Error);
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
