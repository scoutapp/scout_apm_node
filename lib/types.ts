import * as semver from "semver";
import { Readable } from "stream";
import { Buffer } from "buffer";
import { v1 as uuidv1 } from "uuid";

import * as Errors from "./errors";
import * as Constants from "./constants";

export enum AgentType {
    Process = "process",
}

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

////////////
// Events //
////////////

export enum AgentEvent {
    SocketResponseReceived = "socket-response-received",
    SocketResponseParseError = "socket-response-parse-error",
    SocketDisconnected = "socket-disconnected",
    SocketError = "socket-error",
    SocketConnected = "socket-connected",
    SocketReconnectAttempted = "socket-reconnect-attempted",
    SocketReconnectLimitReached = "socket-reconnect-limit-reached",

    RequestStarted = "request-started",
    RequestFinished = "request-finished",
}

//////////////
// Requests //
//////////////

export enum AgentRequestType {
    V1GetVersion = "v1-get-version",
    V1Register = "v1-register",
    V1StartRequest = "v1-start-request",
    V1FinishRequest = "v1-finish-request",
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

export class V1GetVersionRequest extends AgentRequest {
    public readonly type: AgentRequestType = AgentRequestType.V1GetVersion;

    constructor() {
        super();
        this.json = {CoreAgentVersion: {}};
    }
}

export class V1Register extends AgentRequest {
    public readonly type: AgentRequestType = AgentRequestType.V1StartRequest;

    constructor(app: string, key: string, version: CoreAgentVersion) {
        super();
        this.json = {
            Register: {
                api_version: version.raw,
                app,
                key,
            },
        };
    }
}

export class V1StartRequest extends AgentRequest {
    public readonly type: AgentRequestType = AgentRequestType.V1StartRequest;

    public readonly requestId: string;

    constructor(requestId?: string, timestamp?: Date) {
        super();
        const id = requestId || uuidv1();
        const prefix = Constants.DEFAULT_REQUEST_PREFIX;
        this.requestId = `${prefix}${id}`;

        this.json = {
            StartRequest: {
                request_id: this.requestId,
                timestamp,
            },
        };
    }
}

export class V1FinishRequest extends AgentRequest {
    public readonly type: AgentRequestType = AgentRequestType.V1FinishRequest;

    constructor(requestId: string, timestamp?: Date) {
        super();
        this.json = {
            FinishRequest: {
                request_id: requestId,
                timestamp,
            },
        };
    }
}

///////////////
// Responses //
///////////////

export enum AgentResponseType {
    Unknown = "unknown",

    V1GetVersion = "v1-get-version-response",
    V1Register = "v1-register-response",
    V1StartRequest = "v1-start-request-response",
    V1FinishRequest = "v1-finish-request-response",
}

export enum AgentResponseResult {
    Success = "Success",
}

interface ResponseTypeAndCtor { // "RTAC"
    type: AgentResponseType;
    ctor?: (obj: object) => AgentResponse;
}

type RTACWithCheck = [
    (obj: object) => boolean,
    ResponseTypeAndCtor,
];

// TODO: make this more efficient (hash lookup) if it's the case
// that version checking is just looking for key in outer object of response
const RTAC_LOOKUP: RTACWithCheck[] = [
    [
        obj => "CoreAgentVersion" in obj,
        {type: AgentResponseType.V1GetVersion, ctor: (obj) => new V1GetVersionResponse(obj)},
    ],
    [
        obj => "Register" in obj,
        {type: AgentResponseType.V1Register, ctor: (obj) => new V1RegisterResponse(obj)},
    ],
    [
        obj => "StartRequest" in obj,
        {type: AgentResponseType.V1StartRequest, ctor: (obj) => new V1StartRequestResponse(obj)},
    ],
    [
        obj => "FinishRequest" in obj,
        {type: AgentResponseType.V1FinishRequest, ctor: (obj) => new V1FinishRequestResponse(obj)},
    ],
];

function getResponseTypeAndConstrutor(obj: object): ResponseTypeAndCtor {
    const rwc: RTACWithCheck | undefined = RTAC_LOOKUP.find((rwc: RTACWithCheck) => rwc[0](obj));
    if (rwc && rwc[1]) { return rwc[1]; }

    return {type: AgentResponseType.Unknown, ctor: (obj) => new UnknownResponse(obj)};
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

export class V1GetVersionResponse extends AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.V1GetVersion;
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

export class V1RegisterResponse extends AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.V1Register;
    public readonly result: string;

    constructor(obj: any) {
        super();
        if (!("Register" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1RegisterResponse, 'Register' key missing");
        }
        const inner = obj.Register;
        if ("result" in inner) { this.result = inner.result; }
    }
}

export class V1StartRequestResponse extends AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.V1StartRequest;
    public readonly result: string;

    constructor(obj: any) {
        super();
        if (!("StartRequest" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1StartRequestResponse, 'StartRequest' key missing");
        }

        const inner = obj.StartRequest;
        if ("result" in inner) { this.result = inner.result; }
    }
}

export class V1FinishRequestResponse extends AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.V1FinishRequest;
    public readonly result: string;

    constructor(obj: any) {
        super();
        if (!("FinishRequest" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1FinishRequestResponse, 'FinishRequest' key missing");
        }

        const inner = obj.FinishRequest;
        if ("result" in inner) { this.result = inner.result; }
    }
}

export class UnknownResponse extends AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.Unknown;
    public readonly raw: any;

    constructor(obj: any) {
        super();
        this.raw = obj;
    }
}

/////////////
// Options //
/////////////

export type AgentOptions = ProcessOptions;

/**
 * Options for agents that are in a separate process not managed by this one
 */
export class ProcessOptions {
    // Path to the binary to use (if starting the process is required)
    public readonly binPath: string;
    /// URI of the process (with appropriate scheme prefix, ex. 'unix://')
    public readonly uri: string;
    /// Limit consecutive socket reconnection attempts
    public readonly socketReconnectLimit?: number;

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

            // Reconnect limit could be zero (no reconnects)
            if ("socketReconnectLimit" in opts) {
                this.socketReconnectLimit = opts.socketReconnectLimit;
            }
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

////////////////////////////
// Versioning / Manifests //
////////////////////////////

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
    rawVersion: string;
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

////////////////////////////
// Download configuration //
////////////////////////////

export interface AgentDownloadConfigs {
    [k: string]: AgentDownloadConfig[];
}

export interface AgentDownloadOptions {
    // Directory to use for download cache, should either contain `core-agent`
    // or a subdirectory w/ the verison name
    cacheDir?: string;
    // Whether to update the cache
    updateCache?: boolean;
    // Disallow external downloads
    disallowDownloads?: boolean;
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

///////////
// Agent //
///////////

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
