import { valid as isValidSemVer } from "semver";
import { createPool, Options as GenericPoolOptions } from "generic-pool";

import {
    AgentRequestType,
    AgentResponseType,
    AgentType,
    LogLevel,
} from "./enum";

import { JSONValue } from "./util";

import { Buffer } from "buffer";
import { InvalidVersion } from "../errors";
import * as Constants from "../constants";

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

export abstract class AgentRequest {
    // Type of message
    public readonly type: AgentRequestType;
    // Raw JSON of the message
    public json: JSONValue;

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

export class CoreAgentVersion {
    public readonly raw: string;

    constructor(v: string) {
        const converted = isValidSemVer(v);
        if (!converted) { throw new InvalidVersion(`Invalid version [${v}]`); }

        this.raw = converted;
    }
}

export interface AgentManifest {
    version: string;
    core_agent_version: string;
    core_agent_binary: string;
    core_agent_binary_sha256: string;
}

export interface HashDigests {
    sha256?: string;
    sha512?: string;
}

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
    public readonly disallowLaunch?: boolean;

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
            if (opts.disallowLaunch) { this.disallowLaunch = opts.disallowLaunch; }
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

export interface AgentStatus {
    connected: boolean;
}
