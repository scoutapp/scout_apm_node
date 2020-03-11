/// <reference types="node" />
import { EventEmitter } from "events";
import { Socket } from "net";
import { ChildProcess } from "child_process";
import { Agent, AgentStatus, AgentType, BaseAgentRequest, BaseAgentResponse, LogFn, ProcessOptions } from "../types";
import { V1Register, V1ApplicationEvent } from "../protocol/v1/requests";
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
    send<T extends BaseAgentRequest, R extends BaseAgentResponse>(msg: T, socket?: Socket): Promise<R>;
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
     * Send a single message over a given connected socket
     *
     * @param {Socket} socket - The connected socket over which to send the message
     * @param {BaseAgentRequest} msg - The message to send
     * @returns {Promise<R extends BaseAgentResponse>} A promise that evalua
     */
    sendSingle<T extends BaseAgentRequest, R extends BaseAgentResponse>(socket: Socket, msg: T): Promise<{
        socket: Socket;
        response: R;
    }>;
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
     * @param {Socket} socket
     * @param {Error} err - the error that occurred
     */
    private handleSocketError;
    /**
     * Handle a socket closure
     *
     * @param {Socket} socket
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
     * @param {Socket} socket - The socket the data was received over
     * @param {Buffer} data - data received over a socket
     * @param {Buffer} chunks - data left over from the previous reads of the socket
     */
    private handleSocketData;
    private getSocketPath;
    private startProcess;
}
