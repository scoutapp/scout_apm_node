import * as semver from "semver";
import { Readable } from "stream";

import * as Errors from "./errors";
import * as Constants from "./constants";

export enum AgentType {
    Process = "process",
}

export class AgentMessage {
    private readonly contentLength: number;
    private readonly contents: Buffer;
}

export class AgentResponse {
    private readonly contents: Buffer;
}

export type AgentOptions = ProcessOptions;

export interface AgentStatus {
    connected: boolean;
}

export enum LogLevel {
    Info = "info",
    Warn = "warn",
    Debug = "debug",
    Trace = "trace",
    Error = "error",
}

/**
 * Options for agents that are in a separate process not managed by this one
 */
export class ProcessOptions {
    // Path to the binary to use (if starting the process is required)
    public readonly binPath: string;
    /// URI of the process (with appropriate scheme prefix, ex. 'unix://')
    public readonly uri: string;
    // Port of the agent process
    public readonly port?: number;

    public readonly logLevel?: LogLevel;
    public readonly logFilePath?: string;
    public readonly configFilePath?: string;

    constructor(binPath: string, uri: string, opts?: Partial<ProcessOptions>) {
        this.binPath = binPath;
        this.uri = uri;

        if (opts) {
            if (opts.port) { this.port = opts.port; }
            if (opts.logLevel) { this.logLevel = opts.logLevel; }
            if (opts.logFilePath) { this.logFilePath = opts.logFilePath; }
            if (opts.configFilePath) { this.configFilePath = opts.configFilePath; }
        }
    }

    /**
     * Returns whether the address represents a domain socket
     *
     * @returns {boolean} whether the address is a domain socket
     */
    public isDomainSocket(): boolean {
        return this.uri.startsWith(Constants.DOMAIN_SOCKET_URI_SCHEME);
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
    GNULinux32 = "i686-unknown-linux-gnu",
    GNULinux64 = "x86_64-unknown-linux-gnu",
    MuslLinux64 = "x86_64-unknown-linux-musl",
    AppleDarwin64 = "x86_64-apple-darwin",
}

export interface AgentDownloadConfigs {
    [k: string]: AgentDownloadConfig[];
}

export interface AgentDownloadOptions {
    version: CoreAgentVersion;
}

export class CoreAgentVersion {
    public readonly version: string;

    constructor(v: string) {
        const converted = semver.valid(v);
        if (!converted) { throw new Errors.InvalidVersion(`Invalid version [${v}]`); }
        if (!Constants.SUPPORTED_CORE_AGENT_VERSIONS.includes(converted)) {
            throw new Errors.InvalidVersion(`Unsupported scout agent version [${converted}]`);
        }

        this.version = converted;
    }
}

export interface AgentDownloader {
    /**
     * Retrieve download configurations for given version
     *
     * @param {CoreAgentVersion} v - intended version
     * @returns {Promise<AgentDownloadConfig[]>} One or more download configurations for the given version
     */
    getDownloadConfigs(v: CoreAgentVersion): Promise<AgentDownloadConfig[]>;

    /**
     * Verify a binary at a given path.
     *
     * @param {string} path - Path to the binary
     * @param {AgentDownloadConfig} adc? - The agent download configuration used
     * @returns {Promise<boolean>} Whether the binary is valid or not
     */
    checkBinary(path: string, adc?: AgentDownloadConfig): Promise<boolean>;

    /**
     * Download & verify the core-agent binary
     * @param {AgentDownloadConfig} config - Config for downloading the agent (url, hash, expected manifest, etc)
     * @param {AgentDownloadOptions} opts - Options for download the agent
     * @returns {string} The path the downloaded & verified binary
     */
    download(v: CoreAgentVersion, opts: AgentDownloadOptions): Promise<string>;
}

/**
 * Scout APM Agent which handles communicating with a local/remote Scout Core Agent process
 * to relay performance and monitoring information
 */
export interface Agent {
    /**
     * Get the type of the agent
     * @returns {Readonly<AgentType>}
     */
    type(): Readonly<AgentType>;

    /**
     * Get the options used by the agent
     * @returns {Readonly<AgentOptions>}
     */
    options(): Readonly<AgentOptions>;

    /**
     * Get the status of the connected agent
     *
     * @returns {Promise<AgentStatus>} The status of the agent
     */
    status(): Promise<AgentStatus>;

    /**
     * Start the agent
     * @param {AgentDownloadOptions} opts - Options for download the agent
     */
    start(): Promise<Agent>;

    /**
     * Connect to the agent
     * @returns {Promise<AgentStatus>} a Promise that resolves when connection is completed
     */
    connect(): Promise<AgentStatus>;

    /**
     * Disconnect the agent
     * @returns {Promise<AgentStatus>} a Promise that resolves when connection is completed
     */
    disconnect(): Promise<AgentStatus>;

    /**
     * Send a single message to the agent
     * @param {AgentMessage} msg - The message to send
     * @returns {AgentREsponse} - The response from the agent
     */
    send(msg: AgentMessage): Promise<AgentResponse>;
}
