/// <reference types="node" />
import { Options as GenericPoolOptions } from "generic-pool";
import { AgentRequestType, AgentResponseType, AgentType, LogLevel } from "./enum";
import { JSONValue } from "./util";
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
    send<T extends BaseAgentRequest, R extends BaseAgentResponse>(msg: T): Promise<R>;
    /**
     * Send a single message to the agent asynchronously
     * @param {AgentRequest} msg - The message to send
     * @returns {AgentResponse} - The response from the agent
     */
    sendAsync<T extends BaseAgentRequest>(msg: T): Promise<void>;
}
export declare abstract class BaseAgentRequest {
    readonly type: AgentRequestType;
    json: JSONValue;
    /**
     * Convert the message to the binary type that is readable by core-agent
     *
     * @returns {Buffer} the buffer of bytes
     */
    toBinary(): Buffer;
    /**
     * Get a request ID
     * @returns {string | null} Request ID if the request has one
     */
    getRequestId(): string | null;
}
export declare abstract class BaseAgentResponse {
    readonly type: AgentResponseType;
    protected result?: string;
    /**
     * Check whether some JSON value matches the structure for a given agent response
     *
     * @param json: any
     * @returns {boolean} whether the JSON matches the response or not
     */
    matchesJson(json: object): boolean;
    /**
     * Get a request ID
     * @returns {string | null} Request ID if the request has one
     */
    getRequestId(): string | null;
    /**
     * Check whether a response was successful
     * @return {boolean} whether the response was successful
     */
    succeeded(): boolean;
}
export declare class CoreAgentVersion {
    readonly raw: string;
    constructor(v: string);
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
export declare type AgentOptions = ProcessOptions;
export declare type ConnectionPoolOptions = Partial<GenericPoolOptions>;
/**
 * Options for agents that are in a separate process not managed by this one
 */
export declare class ProcessOptions {
    /**
     * Check if some object is a valid ProcessOptions object
     *
     * @param {any} obj
     * @returns {boolean} whether the object is a valid ProcessOptions
     */
    static isValid(obj: any): obj is ProcessOptions;
    readonly binPath: string;
    readonly uri: string;
    readonly logLevel?: LogLevel;
    readonly logFilePath?: string;
    readonly configFilePath?: string;
    readonly disallowLaunch?: boolean;
    readonly socketPath?: string;
    readonly sendTimeoutMs: number;
    readonly socketTimeoutMs: number;
    readonly connPoolOpts?: ConnectionPoolOptions;
    constructor(binPath: string, uri: string, opts?: Partial<ProcessOptions>);
    /**
     * Returns whether the address represents a domain socket
     *
     * @returns {boolean} whether the address is a domain socket
     */
    isDomainSocket(): boolean;
}
export interface AgentStatus {
    connected: boolean;
}
export declare enum AgentSocketType {
    TCP = "tcp",
    Unix = "unix"
}
