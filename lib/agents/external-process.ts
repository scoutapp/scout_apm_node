import { Agent, AgentType, AgentStatus, AgentMessage, AgentResponse, ProcessOptions } from "../types";
import * as Errors from "../errors";
import * as Constants from "../constants";
import { Socket } from "net";

const DEFAULT_OPTIONS: ProcessOptions = new ProcessOptions(Constants.DEFAULT_SOCKET_ADDR);

export default class ExternalProcessAgent implements Agent {
    private readonly agentType: AgentType = AgentType.Process;
    private readonly opts: ProcessOptions;
    private socket: Socket;

    constructor(opts?: ProcessOptions) {
        this.opts = opts || DEFAULT_OPTIONS;
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
    public start(): Promise<Agent> {
        // TODO: Check if the agent is started
        // TODO: start if not present
        // TODO: use option for socket path when checking
        return Promise.reject(new Errors.NotImplemented());
    }

    /** @see Agent */
    public connect(): Promise<AgentStatus> {
        if (this.socket) { return this.status(); }
        // TODO: Connect to the agent (create a client)
        // TODO: Use option for socket path
        return Promise.reject(new Errors.NotImplemented());
    }

    /** @see Agent */
    public disconnect(): Promise<AgentStatus> {
        if (!this.socket) { return this.status(); }

        // TODO: Disconnect from the agent (delete the current client)
        return Promise.reject(new Errors.NotImplemented());
    }

    /** @see Agent */
    public send(msg: AgentMessage): Promise<AgentResponse> {
        // TODO: Send a message to the agent
        return Promise.reject(new Errors.NotImplemented());
    }

}
