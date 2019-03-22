import * as semver from "semver";
import { Readable } from "stream";
import { Buffer } from "buffer";

import * as Errors from "./errors";
import * as Constants from "./constants";

export enum AgentType {
    Process = "process",
}

export enum AgentEvent {
    SocketResponseReceived = "socket-response-received",
    SocketResponseParseError = "socket-response-parse-error",
    SocketDisconnected = "socket-disconnected",
    SocketError = "socket-error",
    SocketConnected = "socket-connected",
}

export enum AgentRequestType {
    V1GetVersion = "v1-get-version",
}

export abstract class AgentRequest {
    // Type of message
    public readonly type: AgentRequestType;
    // Raw JSON of the message
    protected json: any;

    /**
     * Convert the message to the binary type that is readable by core-agent
     *
     * @returns {Buffer} the buffer of bytes
     */
    public toBinary(): Buffer {
        const content = JSON.stringify(this.json);
        const payload = Buffer.from(content, "utf8");
        const length = Buffer.allocUnsafe(4);
        length.writeUInt32BE(payload.length, 0);

        return Buffer.concat([length, payload]);
    }

    /**
     * Get a request ID
     * @returns {string | null} Request ID if the request has one
     */
    public getRequestId(): string | null {
        return null;
    }
}

export enum AgentResponseType {
    Unknown = "unknown",

    V1GetVersionResponse = "v1-get-version-response",
    V1GenericSuccess = "v1-generic-success",
}

interface RepsonseTypeAndCtor {
    type: AgentResponseType;
    ctor?: (obj: object) => AgentResponse;
}

function getResponseTypeAndConstrutor(obj: object): RepsonseTypeAndCtor {
    if ("CoreAgentVersion" in obj) {
        return {type: AgentResponseType.V1GetVersionResponse, ctor: (obj) => new V1GetVersionResponse(obj)};
    }

    return {type: AgentResponseType.Unknown};
}

export abstract class AgentResponse {
    /**
     * Parse the message from a binary buffer
     *
     * @param {Buffer} buf the buffer of bytes
     * @returns {Promise<AgentResponse>} A promise that resovles to a response, if parse succeeded
     */
    public static fromBinary<T extends AgentResponse>(buf: Buffer): Promise<AgentResponse> {
        return new Promise((resolve, reject) => {
            // Expect 4 byte content length, then JSON message
            if (buf.length < 5) {
                return Promise.reject(new Errors.MalformedAgentResponse(`Unexpected buffer length [${buf.length}]`));
            }

            // Pull and check the payload length
            const payloadLen: number = buf.readUInt32BE(0);
            const expected = buf.length - 4;
            if (expected !== payloadLen) {
                return Promise.reject(new Errors.MalformedAgentResponse(
                    `Invalid Content length: (expected ${expected}, received ${payloadLen})`,
                ));
            }

            // Extract & parse JSON
            const json = buf.toString("utf8", 4, buf.length);
            const obj = JSON.parse(json);

            // Detect response type
            const {type: responseType, ctor} = getResponseTypeAndConstrutor(obj);
            if (responseType === AgentResponseType.Unknown) {
                reject(new Errors.UnrecognizedAgentResponse(`Raw JSON: ${json}`));
                return;
            }

            // Construct specialized response type
            if (!ctor) {
                reject(new Errors.UnexpectedError("Failed to construct response type"));
                return;
            }
            const response = ctor(obj);

            resolve(response);
        });
    }

    // Type of message
    public readonly type: AgentResponseType;

    /**
     * Check whether some JSON value matches the structure for a given agent response
     *
     * @param json: any
     * @returns {boolean} whether the JSON matches the response or not
     */
    public matchesJson(json: object): boolean {
        return false;
    }

    /**
     * Get a request ID
     * @returns {string | null} Request ID if the request has one
     */
    public getRequestId(): string | null {
        return null;
    }
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

    public readonly logLevel?: LogLevel;
    public readonly logFilePath?: string;
    public readonly configFilePath?: string;

    constructor(binPath: string, uri: string, opts?: Partial<ProcessOptions>) {
        this.binPath = binPath;
        this.uri = uri;

        if (opts) {
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
    public readonly raw: string;

    constructor(v: string) {
        const converted = semver.valid(v);
        if (!converted) { throw new Errors.InvalidVersion(`Invalid version [${v}]`); }
        if (!Constants.SUPPORTED_CORE_AGENT_VERSIONS.includes(converted)) {
            throw new Errors.InvalidVersion(`Unsupported scout agent version [${converted}]`);
        }

        this.raw = converted;
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
     * @returns {Promise<this>} A promise that resolves to the agent object
     */
    start(): Promise<this>;

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
     * @param {AgentRequest} msg - The message to send
     * @returns {AgentREsponse} - The response from the agent
     */
    send(msg: AgentRequest): Promise<AgentResponse>;

    /**
     * Send a single message to the agent asynchronously
     * @param {AgentRequest} msg - The message to send
     * @returns {AgentREsponse} - The response from the agent
     */
    sendAsync(msg: AgentRequest): Promise<void>;
}

export class V1GetVersionRequest extends AgentRequest {
    public readonly type: AgentRequestType = AgentRequestType.V1GetVersion;

    constructor() {
        super();
        this.json = {CoreAgentVersion: {}};
    }
}

export class V1GetVersionResponse extends AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.V1GetVersionResponse;
    public readonly result: string;
    public readonly version: CoreAgentVersion;

    constructor(obj: any) {
        super();
        if (!("CoreAgentVersion" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1GetVersionResponse, 'CoreAgentVersion' key missing");
        }
        const inner = obj.CoreAgentVersion;

        this.version = new CoreAgentVersion(inner.version);
        if ("result" in inner) { this.result = inner.result; }
    }
}
