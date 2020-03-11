/// <reference types="node" />
import { EventEmitter } from "events";
import { Socket } from "net";
import { ChildProcess } from "child_process";
import { Agent, AgentStatus, AgentType, BaseAgentRequest, BaseAgentResponse, LogFn, ProcessOptions } from "../types";
import { V1ApplicationEventResponse, V1RegisterResponse } from "../protocol/v1/responses";
import { V1Register, V1ApplicationEvent } from "../protocol/v1/requests";
export declare type ExtraSocketInfo = {
    registrationSent?: boolean;
    registrationResp?: V1RegisterResponse;
    appMetadataSent?: boolean;
    appMetadataResp?: V1ApplicationEventResponse;
    onFailure?: () => void;
};
export declare type ScoutSocket = Socket & ExtraSocketInfo;
export default class ExternalProcessAgent extends EventEmitter implements Agent {
    private readonly agentType;
    private readonly opts;
    private pool;
    private poolErrors;
    private maxPoolErrors;
    private poolDisabled;
    private socketConnected;
    private socketConnectionAttempts;
    private detachedProcess;
    private stopped;
    private logFn;
    private registrationMsg;
    private appMetadata;
    constructor(opts: ProcessOptions, logFn?: LogFn);
    /** @see Agent */
    type(): Readonly<AgentType>;
    /** @see Agent */
    options(): Readonly<ProcessOptions>;
    /** @see Agent */
    status(): Promise<AgentStatus>;
    /** @see Agent */
    start(): Promise<this>;
    /** @see Agent */
    connect(): Promise<AgentStatus>;
    /** @see Agent */
    disconnect(): Promise<AgentStatus>;
    /** @see Agent */
    sendAsync<T extends BaseAgentRequest>(msg: T): Promise<void>;
    /** @see Agent */
    send<T extends BaseAgentRequest, R extends BaseAgentResponse>(msg: T, socket?: ScoutSocket): Promise<R>;
    /**
     * Check if the process is present
     */
    getProcess(): Promise<ChildProcess>;
    /**
     * Stop the process (if one is running)
     */
    stopProcess(): Promise<void>;
    /**
     * Set the registration and metadata that will be used by the agent
     * as the first thing to send whenever a connection is established
     *
     * @param {V1Register} registerMsg - Registration message
     * @param {V1ApplicationEvent} metadata - App metadata
     */
    setRegistrationAndMetadata(registerMsg: V1Register, appMetadata: V1ApplicationEvent): void;
    /**
     * Initialize the socket pool
     *
     * @returns {Promise<Pool<Socket>>} A promise that resolves to the socket pool
     */
    private initPool;
    /**
     * Create a socket to the agent for sending requests
     *
     * NOTE: this method *must* police itself, if it fails too many times
     *
     * @returns {Promise<Socket>} A socket for use in  the socket pool
     */
    private createDomainSocket;
    /**
     * Handle socket error
     *
     * @param {ScoutSocket} socket - socket enhanced with extra scout-related information
     * @param {Error} err - the error that occurred
     */
    private handleSocketError;
    /**
     * Handle a socket closure
     *
     * @param {ScoutSocket} socket - socket enhanced with extra scout-related information
     */
    private handleSocketClose;
    /**
     * Handle a socket disconnect
     *
     * @param {Socket} socket
     */
    private handleSocketDisconnect;
    /**
     * Process received socket data
     *
     * @param {ScoutSocket} socket - socket enhanced with extra scout-related information
     * @param {Buffer} data - data received over a socket
     * @param {Buffer} chunks - data left over from the previous reads of the socket
     */
    private handleSocketData;
    private getSocketPath;
    private startProcess;
}
