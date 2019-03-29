import * as semver from "semver";
import { Readable } from "stream";
import { Buffer } from "buffer";
import { v1 as uuidv1 } from "uuid";
import { hostname } from "os";
import { createPool, Options as GenericPoolOptions } from "generic-pool";

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

export type JSONValue = object | string | number;

export class ApplicationMetadata {
    public readonly language: string;
    public readonly version: string;
    public readonly serverTime: string;
    public readonly framework: string;
    public readonly frameworkVersion: string;
    public readonly environment: string;
    public readonly appServer: string;
    public readonly hostname: string;
    public readonly databaseEngine: string;
    public readonly databaseAdapter: string;
    public readonly applicationName: string;
    public readonly libraries: string;
    public readonly paas: string;
    public readonly gitSHA: string;
}

export enum ApplicationEventType {
    ScoutMetadata = "scout.metadata",

    CPUUtilizationPercent = "CPU/Utilization",
    MemoryUsageMB = "Memory/Physical",
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

    RequestStarted = "request-started",
    RequestFinished = "request-finished",

    SpanStarted = "span-started",
    SpanStopped = "span-stopped",

    ApplicationEventReported = "application-event-reported",
}

export enum AgentRequestType {
    V1GetVersion = "v1-get-version",
    V1Register = "v1-register",

    V1StartRequest = "v1-start-request",
    V1FinishRequest = "v1-finish-request",
    V1TagRequest = "v1-tag-request",

    V1StartSpan = "v1-start-span",
    V1StopSpan = "v1-stop-span",
    V1TagSpan = "v1-tag-span",

    V1ApplicationEvent = "v1-application-event",
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

///////////////
// Responses //
///////////////

export enum AgentResponseType {
    Unknown = "unknown",

    V1GetVersion = "v1-get-version-response",
    V1Register = "v1-register-response",
    V1StartRequest = "v1-start-request-response",
    V1FinishRequest = "v1-finish-request-response",
    V1TagRequest = "v1-tag-request-response",

    V1StartSpan = "v1-start-span-response",
    V1StopSpan = "v1-stop-span-response",
    V1TagSpan = "v1-tag-span-response",

    V1ApplicationEvent = "v1-application-event-response",

    V1Failure = "v1-failure-response",
}

interface AgentResponseFailureResult {
    Failure: {message: string};
}

type AgentResponseSuccessResult = "Success";
type AgentResponseResult = AgentResponseSuccessResult | AgentResponseFailureResult ;

function isSuccessfulResponseResult(obj: any): obj is AgentResponseSuccessResult {
    return obj && typeof obj === "string" && obj === "Success";
}

export abstract class AgentResponse {
    // Type of message
    public readonly type: AgentResponseType;

    // Result (if present)
    protected result?: string;

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

    /**
     * Check whether a response was successful
     * @return {boolean} whether the response was successful
     */
    public succeeded(): boolean {
        return isSuccessfulResponseResult(this.result);
    }
}

/////////////
// Options //
/////////////

export type AgentOptions = ProcessOptions;

export type ConnectionPoolOptions = Partial<GenericPoolOptions>;

/**
 * Options for agents that are in a separate process not managed by this one
 */
export class ProcessOptions {
    /**
     * Check if some object is a valid ProcessOptions object
     *
     * @param {any} obj
     * @returns {boolean} whether the object is a valid ProcessOptions
     */
    public static isValid(obj: any): obj is ProcessOptions {
        return obj
            && "binPath" in obj && typeof obj.binPath === "string"
            && "uri" in obj && typeof obj.uri === "string"
            && "isDomainSocket" in obj && typeof obj.isDomainSocket === "function";
    }

    // Path to the binary to use (if starting the process is required)
    public readonly binPath: string;
    /// URI of the process (with appropriate scheme prefix, ex. 'unix://')
    public readonly uri: string;

    public readonly logLevel?: LogLevel;
    public readonly logFilePath?: string;
    public readonly configFilePath?: string;

    // Customize conection pool
    public readonly connPoolOpts?: ConnectionPoolOptions = Constants.DEFAULT_CONNECTION_POOL_OPTS;

    constructor(binPath: string, uri: string, opts?: Partial<ProcessOptions>) {
        this.binPath = binPath;
        this.uri = uri;

        if (opts) {
            if (opts.logLevel) { this.logLevel = opts.logLevel; }
            if (opts.logFilePath) { this.logFilePath = opts.logFilePath; }
            if (opts.configFilePath) { this.configFilePath = opts.configFilePath; }
            if (opts.connPoolOpts) { this.connPoolOpts = opts.connPoolOpts; }
        }
    }

    /**
     * Returns whether the address represents a domain socket
     *
     * @returns {boolean} whether the address is a domain socket
     */
    public isDomainSocket(): boolean {
        return Constants.DOMAIN_SOCKET_URI_SCHEME_RGX.test(this.uri);
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

export enum APIVersion {
    V1 = "1.0",
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
     * @returns {AgentResponse} - The response from the agent
     */
    send(msg: AgentRequest): Promise<AgentResponse>;

    /**
     * Send a single message to the agent asynchronously
     * @param {AgentRequest} msg - The message to send
     * @returns {AgentResponse} - The response from the agent
     */
    sendAsync(msg: AgentRequest): Promise<void>;
}

interface MapLike {
    get(s: string): any;
}

export enum URIReportingLevel {
    FilteredParams = "filtered-params",
    PathOnly = "path-only",
}

export class ScoutConfiguration {
    /**
     * Build a Scout configuration from environment variables available
     *
     * @param {object} env - The environment
     * @returns {Partial<ScoutConfiguration>} The generated scout configuration
     */
    public static fromEnv(env: Record<string, string | undefined> = process.env): Partial<ScoutConfiguration> {
        const result: any = {};
        if (env.SCOUT_APP) { result.applicationName = env.SCOUT_APP; }
        if (env.SCOUT_KEY) { result.key = env.SCOUT_KEY; }
        if (env.SCOUT_REVISION_SHA) { result.revisionSHA = env.SCOUT_REVISION_SHA; }

        if (env.SCOUT_LOG_LEVEL && Object.values(LogLevel).includes(env.SCOUT_LOG_LEVEL)) {
            result.logLevel = env.SCOUT_LOG_LEVEL as LogLevel;
        }

        if (env.SCOUT_HTTP_PROXY) { result.httpProxy = env.SCOUT_HTTP_PROXY; }
        if (env.SCOUT_HOSTNAME) { result.hostname = env.SCOUT_HOSTNAME; }

        if (env.SCOUT_IGNORED_ROUTE_PREFIXES) {
            result.ignoredRoutePrefixes = env.SCOUT_IGNORED_ROUTE_PREFIXES.split(",").filter(v => v);
        }

        if (env.SCOUT_COLLECT_REMOTE_IP) {
            result.collectRemoteIP = env.SCOUT_COLLECT_REMOTE_IP.toLowerCase() === "true";
        }

        if (env.SCOUT_URI_REPORTING_LEVEL &&
            Object.values(LogLevel).includes(env.URI_REPORTING_LEVEL)) {
            result.uriReportingLevel = env.SCOUT_URI_REPORTING_LEVEL as URIReportingLevel;
        }

        return result;
    }

    /**
     * For ScoutConfiguration from any object that allows `.get(...)` to be called,
     * for example, Express's `app` object
     *
     * @param {MapLike} obj - Some object that supports `get` method calls
     * @returns {Partial<ScoutConfiguration>} The generated scout configuration
     */
    public static fromMapLike(obj: MapLike): Partial<ScoutConfiguration> {
        const result: any = {};

        const applicationName = obj.get("scout.applicationName");
        if (applicationName) { result.applicationName = applicationName; }

        const key = obj.get("scout.key");
        if (key) { result.key = key; }

        const revisionSHA = obj.get("scout.revision.sha");
        if (typeof revisionSHA === "string") { result.revisionSHA = obj.get("scout.revision.sha"); }

        const logLevel = obj.get("scout.log.level");
        if (typeof logLevel === "string" && logLevel && Object.values(LogLevel).includes(obj.get("scout.log.level"))) {
            result.logLevel = logLevel as LogLevel;
        }

        const httpProxy = obj.get("scout.http.proxy");
        if (typeof httpProxy === "string") { result.httpProxy = httpProxy; }

        const hostname = obj.get("scout.hostname");
        if (typeof hostname === "string") { result.hostname = hostname; }

        const ignoredRoutePrefixes = obj.get("scout.ignoredRoutePrefixes");
        if (ignoredRoutePrefixes instanceof Array) {
            result.ignoredRoutePrefixes = ignoredRoutePrefixes;
        } else if (typeof ignoredRoutePrefixes === "string") {
            result.ignoredRoutePrefixes = ignoredRoutePrefixes.split(",").filter(v => v);
        }

        const collectRemoteIP = obj.get("scout.collectRemoteIP");
        if (typeof collectRemoteIP === "string" || typeof collectRemoteIP === "boolean") {
            result.collectRemoteIP = typeof collectRemoteIP === "string" ? collectRemoteIP === "true" : collectRemoteIP;
        }

        const uriReportingLevel = obj.get("scout.uriReportingLevel");
        if (typeof uriReportingLevel === "string" &&
            Object.values(LogLevel).includes(obj.get("scout.uriReportingLevel"))) {
            result.uriReportingLevel = uriReportingLevel as URIReportingLevel;
        }

        return result;
    }

    /**
     * Build the default ScoutConfiguration
     *
     * @returns {ScoutConfiguration} The generated scout configuration
     */
    public static fromDefault(): ScoutConfiguration {
        return new ScoutConfiguration();
    }

    /**
     * Build a scout configuration
     *
     * @param {MapLike} - some object with a getter (e.x. `app.get(...)`)
     * @returns {ScoutConfiguration} The assembled configuration
     */
    public static build(app?: MapLike): ScoutConfiguration {
        return Object.assign(
            ScoutConfiguration.fromDefault(),
            app ? ScoutConfiguration.fromMapLike(app) : {},
            ScoutConfiguration.fromEnv(),
        );
    }

    // Application finger printing / auth
    public readonly applicationName: string = "";
    public readonly key: string = "";
    public readonly revisionSHA: string = "";

    // Operation
    public readonly logLevel: LogLevel = LogLevel.Info;
    public readonly logFilePath: "stdout" | string = "stdout";
    public readonly httpProxy?: string;

    // Machine information
    public readonly hostname: string = hostname();

    // Trace controls
    public readonly ignoredRoutePrefixes: string[] = [];
    public readonly collectRemoteIP: boolean = true;
    public readonly uriReportingLevel: URIReportingLevel = URIReportingLevel.FilteredParams;
}
