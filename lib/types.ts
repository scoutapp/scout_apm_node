const DOMAIN_SOCKET_URI_SCHEME = "http+unix://";

enum AgentType {
    Process = "process",
    ChildProcess = "child-process",
}

class AgentMessage {
    contentLength: number;
    contents: Buffer;
}

class AgentResponse {
    contents: Buffer;
}

interface Agent<T> {
    getType(): T;
    send(msg: AgentMessage): Promise<AgentResponse>;
}

/**
 * Options for a given agent type
 *
 * @param {T} T type of the agent
 */
type AgentOptions = ProcessOptions | ChildProcessOptions;

/**
 * Contact options for agents in a local process
 */
class ProcessOptions {
    /// URI of the process
    public readonly uri: string;
    // Port of the agent process
    public readonly port?: number;

    constructor(uri: string, port?: number) {
        this.uri = uri;
        if (port) { this.port = port; }
    }

    /**
     * Returns whether the address represents a domain socket
     *
     * @returns {boolean} whether the address is a domain socket
     */
    public isDomainSocket(): boolean {
        return this.uri.startsWith(DOMAIN_SOCKET_URI_SCHEME);
    };
}

/**
 * Options for agents that must be spawned in a child process
 */
class ChildProcessOptions {
    // Path to the binary
    public readonly binPath: string;

    constructor(binPath: string) {
        this.binPath = binPath;
    }
}
