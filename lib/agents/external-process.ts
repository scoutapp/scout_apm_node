import { Agent, AgentType, AgentStatus, AgentRequest, AgentResponse, ProcessOptions } from "../types";
import * as Errors from "../errors";
import * as Constants from "../constants";
import { pathExists } from "fs-extra";
import { Socket, createConnection } from "net";
import { spawn, ChildProcess } from "child_process";

export default class ExternalProcessAgent implements Agent {
    private readonly agentType: AgentType = AgentType.Process;
    private readonly opts: ProcessOptions;

    private socket: Socket;
    private detachedProcess: ChildProcess;

    constructor(opts: ProcessOptions) {
        this.opts = opts;
    }

    /** @see Agent */
    public type(): Readonly<AgentType> { return this.agentType; }

    /** @see Agent */
    public options(): Readonly<ProcessOptions> { return Object.assign({}, this.opts); }

    /** @see Agent */
    public status(): Promise<AgentStatus> {
        // TODO: Get the status of the agent (if connected)
        return Promise.reject(new Errors.NotImplemented());
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
            this.socket = createConnection(this.getSocketPath(), () => {
                resolve(this.status());
            });

            this.socket.on("data", (data) => {
                // TODO: parse the data into a message

            });

            this.socket.on("error", err => {
                // TODO: log about failed connection
                reject(err);
            });
        });

        // TODO: Connect to the agent (create a client)
    }

    /** @see Agent */
    public disconnect(): Promise<AgentStatus> {
        if (!this.socket) { return this.status(); }

        // TODO: Disconnect from the agent (delete the current client)
        return Promise.reject(new Errors.NotImplemented());
    }

    /** @see Agent */
    public send<T extends AgentRequest>(msg: T): Promise<AgentResponse> {
        // TODO: Send a message to the agent
        return Promise.reject(new Errors.NotImplemented());
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
    private startProcess(): this {
        // Build command and arguments
        const args = ["start", "--socket", this.getSocketPath()];
        if (this.opts.logFilePath) { args.push("--log-file", this.opts.logFilePath); }
        if (this.opts.configFilePath) { args.push("--config-file", this.opts.configFilePath); }
        if (this.opts.logLevel) { args.push("--log-file", this.opts.logLevel); }

        // TODO: log the child process cmd & args
        this.detachedProcess = spawn(this.opts.binPath, args, {
            detached: true,
            stdio: "ignore",
        });
        this.detachedProcess.unref();

        return this;
    }

}
