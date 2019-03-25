import { EventEmitter } from "events";
import * as Errors from "../errors";
import * as Constants from "../constants";
import { pathExists } from "fs-extra";
import { Socket, createConnection } from "net";
import { spawn, ChildProcess } from "child_process";

import {
    Agent,
    AgentEvent,
    AgentRequest,
    AgentResponse,
    AgentResponseType,
    AgentStatus,
    AgentType,
    ProcessOptions,
} from "../types";

export default class ExternalProcessAgent extends EventEmitter implements Agent {
    private readonly agentType: AgentType = AgentType.Process;
    private readonly opts: ProcessOptions;

    private socket: Socket;
    private socketConnected: boolean = false;
    private socketConnectionAttempts: number = 0;

    private detachedProcess: ChildProcess;

    constructor(opts: ProcessOptions) {
        super();
        this.opts = opts;
    }

    /** @see Agent */
    public type(): Readonly<AgentType> { return this.agentType; }

    /** @see Agent */
    public options(): Readonly<ProcessOptions> { return Object.assign({}, this.opts); }

    /** @see Agent */
    public status(): Promise<AgentStatus> {
        // Get the status of the agent (if connected)
        return Promise.resolve({
            connected: this.socket && this.socketConnected,
        } as AgentStatus);
    }

    /** @see Agent */
    public start(): Promise<this> {
        return pathExists(this.getSocketPath())
            .then(exists => {
                // If the socket doesn't already exist, start the process as configured
                if (!exists) { return this.startProcess(); }
                // TODO: log a info message about the socket already being present
                return this;
            });
    }

    /** @see Agent */
    public connect(): Promise<AgentStatus> {
        if (this.socket) { return this.status(); }

        return new Promise((resolve, reject) => {
            this.socketConnectionAttempts++;

            this.socket = createConnection(this.getSocketPath(), () => {
                this.socketConnected = true;
                this.socketConnectionAttempts = 0;
                this.emit(AgentEvent.SocketConnected);
                resolve(this.status());
            });

            this.socket.on("data", (data: Buffer) => {
                AgentResponse
                    .fromBinary(data)
                    .then(msg => {
                        this.emit(AgentEvent.SocketResponseReceived, msg);

                        switch (msg.type) {
                            case AgentResponseType.V1StartRequest:
                                this.emit(AgentEvent.RequestStarted);
                                break;
                            case AgentResponseType.V1FinishRequest:
                                this.emit(AgentEvent.RequestFinished);
                                break;
                        }
                    })
                    .catch(err => {
                        // TODO: error log parse error
                        this.emit(AgentEvent.SocketResponseParseError, err);
                    });
            });

            this.socket.on("close", () => {
                // TODO: debug log that the socket closed
                this.emit(AgentEvent.SocketDisconnected);
                this.socketConnected = false;

                // Trigger reconnection if there is no limit or we're under it
                const limit = this.opts.socketReconnectLimit;
                const limitExists = typeof limit !== "undefined";
                // If there is a limit, and the limit is either zero or past, do not reconnect
                if (limitExists && (!limit || this.socketConnectionAttempts >= limit!)) {
                    this.emit(AgentEvent.SocketReconnectLimitReached);
                } else {
                    this.emit(AgentEvent.SocketReconnectAttempted);
                    this.connect();
                }

            });

            this.socket.on("error", err => {
                this.emit(AgentEvent.SocketError, err);
                // TODO: debug log about error during connection
                reject(err);
            });
        });
    }

    /** @see Agent */
    public disconnect(): Promise<AgentStatus> {
        if (!this.socket) { return this.status(); }

        // Disconnect from the agent (delete the current client)
        return new Promise((resolve) => {
            this.socket.destroy();
            // TODO: Wait until socket is destroyed?
            resolve(this.status());
        });
    }

    /** @see Agent */
    public sendAsync<T extends AgentRequest>(msg: T): Promise<void> {
        if (!this.socket) { return Promise.reject(new Errors.Disconnected()); }

        const msgBinary = msg.toBinary();
        this.socket.write(msgBinary);
        return Promise.resolve();
    }

    /** @see Agent */
    public send<T extends AgentRequest>(msg: T): Promise<AgentResponse> {
        const requestType = msg.type;

        // Build a check fn that works
        const checkFn = (r: AgentResponse) => {
            if (r.type === AgentResponseType.V1GetVersion) {
                return r.type && r.type === AgentResponseType.V1GetVersion;
            }
            return msg.getRequestId() === r.getRequestId();
        };

        return new Promise(resolve => {
            // Set up a temporary listener
            const listener = (resp: any) => {
                // Skip non-matching socket responses
                if (!checkFn(resp)) { return; }

                // Remove this listener
                this.removeListener(AgentEvent.SocketResponseReceived, listener);

                // Resolve the encasing promise
                resolve(resp);
            };

            // Send the message async
            this.on(AgentEvent.SocketResponseReceived, listener);
            return this.sendAsync(msg);
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

        // TODO: log the child process cmd & args
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
                        if (exists) { resolve(this); }
                    })
                    .catch(reject);
            }, Constants.DEFAULT_BIN_STARTUP_WAIT_MS);
        });
    }

}
