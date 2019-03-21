import { Agent, AgentType, AgentStatus, AgentMessage, AgentResponse, ProcessOptions } from "../types";
import * as Errors from "../errors";
import * as Constants from "../constants";

const DEFAULT_OPTIONS: ProcessOptions = new ProcessOptions(Constants.DEFAULT_SOCKET_ADDR);

export default class ExternalProcessAgent implements Agent {
    private readonly agentType: AgentType = AgentType.Process;
    private readonly opts: ProcessOptions;

    constructor(opts?: ProcessOptions) {
        this.opts = opts || DEFAULT_OPTIONS;
        // TODO: do constructor business
    }

    /** @see Agent */
    public type(): Readonly<AgentType> { return this.agentType; }

    /** @see Agent */
    public options(): Readonly<ProcessOptions> { return this.opts; }

    /** @see Agent */
    public status(): Promise<AgentStatus> {
        return Promise.reject(new Errors.NotImplemented());
    }

    /** @see Agent */
    public start(): Promise<Agent> {
        return Promise.reject(new Errors.NotImplemented());
    }

    /** @see Agent */
    public connect(): Promise<AgentStatus> {
        return Promise.reject(new Errors.NotImplemented());
    }

    /** @see Agent */
    public disconnect(): Promise<AgentStatus> {
        return Promise.reject(new Errors.NotImplemented());
    }

    /** @see Agent */
    public send(msg: AgentMessage): Promise<AgentResponse> {
        return Promise.reject(new Errors.NotImplemented());
    }

}
