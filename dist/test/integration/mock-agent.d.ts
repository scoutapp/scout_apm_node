import { EventEmitter } from "events";
export interface ParsedMessage {
    type: string;
    raw: object;
}
/**
 * MockAgent creates a TCP server that mimics a core-agent socket.
 * It captures all Scout protocol messages sent by the agent for test assertions.
 */
export declare class MockAgent extends EventEmitter {
    private server;
    private sockets;
    private messages;
    port: number;
    constructor();
    start(): Promise<void>;
    stop(): Promise<void>;
    getMessages(): ParsedMessage[];
    getMessagesByType(type: string): ParsedMessage[];
    /** Write all captured messages to a JSON file for inspection. Creates parent dirs as needed. */
    dumpToFile(filePath: string): void;
    waitForMessage(type: string, timeoutMs?: number): Promise<ParsedMessage>;
    socketPath(): string;
    private handleConnection;
    private processBuffer;
    private extractMessageType;
    private sendResponse;
}
