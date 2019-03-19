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

/**
 * Scout APM Agent which handles communicating with a local/remote Scout Core Agent process
 * to relay performance and monitoring information
 */
interface Agent<T> {
    /**
     * Get the options the agent was started with
     * @returns {Readonly<T>}
     */
    getOptions(): Readonly<AgentOptions>;

    /**
     * Send a single message to the agent
     * @param {AgentMessage} msg - The message to send
     * @returns {AgentREsponse} - The response from the agent
     */
    send(msg: AgentMessage): Promise<AgentResponse>;
}

type AgentOptions = ProcessOptions | ChildProcessOptions;

// Options for agents that are in a separate process (not managed by this one)
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

// Options for agents that are spawned as child processses and controlled from the current thread
class ChildProcessOptions {
    // Path to the binary
    public readonly binPath: string;

    constructor(binPath: string) {
        this.binPath = binPath;
    }
}

interface AgentManifest {
    version: string;
    core_agent_version: string;
    core_agent_binary: string;
    core_agent_binary_sha256: string;
}

interface HashDigests {
    sha256?: string;
    sha512?: string;
}

export interface AgentDownloadConfig {
    url: string;
    zipped: boolean;
    platform: Platform;
    hash?: HashDigests;
    manifest?: AgentManifest;
}

export enum Platform {
    GNULinux64 = "x86_64-unknown-linux-gnu",
    MuslLinux64 = "x86_64-unknown-linux-musl",
    AppleDarwin64 = "x86_64-apple-darwin",
}

export type AgentDownloadConfigs = {[k: string]: AgentDownloadConfig[]};
