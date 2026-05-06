import * as fs from "fs";
import * as net from "net";
import * as path from "path";
import { EventEmitter } from "events";

// Scout protocol responses use the same outer key as the request message type.
// Special case: GetVersion responses use "CoreAgentVersion" as the key.
const RESPONSE_OVERRIDE: Record<string, object> = {
    GetVersion: { CoreAgentVersion: "v1.3.0" },
};

export interface ParsedMessage {
    type: string;
    raw: object;
}

/**
 * MockAgent creates a TCP server that mimics a core-agent socket.
 * It captures all Scout protocol messages sent by the agent for test assertions.
 */
export class MockAgent extends EventEmitter {
    private server: net.Server;
    private sockets: Set<net.Socket> = new Set();
    private messages: ParsedMessage[] = [];
    public port: number = 0;

    constructor() {
        super();
        this.server = net.createServer((socket) => {
            this.sockets.add(socket);
            socket.once("close", () => this.sockets.delete(socket));
            this.handleConnection(socket);
        });
    }

    public start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.listen(0, "127.0.0.1", () => {
                const addr = this.server.address() as net.AddressInfo;
                this.port = addr.port;
                resolve();
            });
            this.server.once("error", reject);
        });
    }

    public stop(): Promise<void> {
        // Destroy all open sockets so the server can close immediately
        this.sockets.forEach((s) => s.destroy());
        this.sockets.clear();
        return new Promise((resolve) => {
            this.server.close(() => resolve());
        });
    }

    public getMessages(): ParsedMessage[] {
        return this.messages.slice();
    }

    public getMessagesByType(type: string): ParsedMessage[] {
        return this.messages.filter((m) => m.type === type);
    }

    /** Write all captured messages to a JSON file for inspection. Creates parent dirs as needed. */
    public dumpToFile(filePath: string): void {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        fs.writeFileSync(filePath, JSON.stringify(this.messages, null, 2), "utf8");
    }

    public waitForMessage(type: string, timeoutMs: number = 3000): Promise<ParsedMessage> {
        return new Promise((resolve, reject) => {
            const existing = this.messages.find((m) => m.type === type);
            if (existing) { return resolve(existing); }

            const timer = setTimeout(() => {
                this.removeListener("message", listener);
                reject(new Error(`Timed out waiting for message type: ${type}`));
            }, timeoutMs);

            const listener = (msg: ParsedMessage) => {
                if (msg.type !== type) { return; }
                clearTimeout(timer);
                this.removeListener("message", listener);
                resolve(msg);
            };

            this.on("message", listener);
        });
    }

    public socketPath(): string {
        return `tcp://127.0.0.1:${this.port}`;
    }

    private handleConnection(socket: net.Socket): void {
        const chunks: Buffer[] = [];

        socket.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
            const buf: Buffer = Buffer.concat(chunks);
            chunks.length = 0;
            const remaining = this.processBuffer(buf, socket);
            if (remaining.length > 0) { chunks.push(remaining); }
        });

        socket.on("error", () => socket.destroy());
    }

    private processBuffer(buf: Buffer, socket: net.Socket): Buffer {
        while (buf.length >= 4) {
            const msgLen = buf.readUInt32BE(0);
            if (buf.length < 4 + msgLen) { break; }

            const msgBytes = buf.subarray(4, 4 + msgLen);
            buf = buf.subarray(4 + msgLen) as Buffer;

            try {
                const parsed = JSON.parse(msgBytes.toString("utf8"));
                const type = this.extractMessageType(parsed);
                const msg: ParsedMessage = { type, raw: parsed };
                this.messages.push(msg);
                this.emit("message", msg);

                // Send a minimal success response
                this.sendResponse(socket, type);
            } catch {
                // ignore parse errors in mock
            }
        }
        return buf;
    }

    private extractMessageType(parsed: any): string {
        if (parsed && typeof parsed === "object") {
            // Scout protocol wraps messages like: { "Register": { ... } }
            const keys = Object.keys(parsed);
            if (keys.length > 0) { return keys[0]; }
        }
        return "Unknown";
    }

    private sendResponse(socket: net.Socket, type: string): void {
        // Scout's ExternalProcessAgent waits for SocketResponseReceived after every send.
        // Response format mirrors the request: outer key = message type, value = result object.
        // Exception: GetVersion uses "CoreAgentVersion" as the response key.
        const resp = RESPONSE_OVERRIDE[type] || { [type]: { result: "Success" } };

        const json = JSON.stringify(resp);
        const jsonBuf = Buffer.from(json, "utf8");
        const lenBuf = Buffer.allocUnsafe(4);
        lenBuf.writeUInt32BE(jsonBuf.length, 0);
        socket.write(Buffer.concat([lenBuf, jsonBuf]));
    }
}
