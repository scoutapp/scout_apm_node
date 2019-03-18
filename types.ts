enum AgentType = {
    Process = "process",
    ChildProcess = "child-process",
}

interface Agent<T> {
    public getType(): T;
    public send(msg: AgentMessage): Promise<AgentResponse>;
}

/**
 * Options for a given agent type
 *
 * @param {T} T type of the agent
 */
abstract class AgentOptions<T> {
    agentType: T;

    constructor(agentType: T) {
        this.agentType = agentType;
    }
}

const DOMAIN_SOCKET_URI_SCHEME = "http+unix://";

/**
 * Contact options for agents in a local process
 */
class ProcessOptions extends AgentContactOptions<AgentContactMethod.Process> {
    /// URI of the process
    public readonly uri: string;
    // Port of the agent process
    public readonly port?: number;

    constructor(uri: string, port?: number) {
        this.super(AgentContactMethod.Process);

        this.uri = uri;
        if (port) { this.port = port; }
    }

    /**
     * Returns whether the address represents a domain socket
     *
     * @returns {boolean} whether the address is a domain socket
     */
    public isDomainSocket() {
        return this.address.startsWith(DOMAIN_SOCKET_URI_SCHEME);
    };
}

/**
 * Options for agents that must be spawned in a child process
 */
class ProcessOptions extends AgentContactOptions<AgentContactMethod.ChildProcess> {
    // Path to the binary
    public readonly binPath: string;

    constructor(binPath: string) {
        this.super(AgentContactMethod.ChildProcess);
        this.binPath = binPath;
    }
}
