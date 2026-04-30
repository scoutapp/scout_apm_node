import * as net from "net";
import { EventEmitter } from "events";

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
    private messages: ParsedMessage[] = [];
    public port: number = 0;

    constructor() {
        super();
        this.server = net.createServer((socket) => this.handleConnection(socket));
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
        return new Promise((resolve, reject) => {
            this.server.close((err) => err ? reject(err) : resolve());
        });
    }

    public getMessages(): ParsedMessage[] {
        return this.messages.slice();
    }

    public getMessagesByType(type: string): ParsedMessage[] {
        return this.messages.filter((m) => m.type === type);
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
        let buf = Buffer.alloc(0);

        socket.on("data", (chunk: Buffer) => {
            buf = Buffer.concat([buf, chunk]);
            this.processBuffer(buf, socket, (remaining) => { buf = remaining; });
        });

        socket.on("error", () => socket.destroy());
    }

    private processBuffer(
        buf: Buffer,
        socket: net.Socket,
        updateBuf: (b: Buffer) => void,
    ): void {
        while (buf.length >= 4) {
            const msgLen = buf.readUInt32BE(0);
            if (buf.length < 4 + msgLen) { break; }

            const msgBytes = buf.slice(4, 4 + msgLen);
            buf = buf.slice(4 + msgLen);
            updateBuf(buf);

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
        let resp: object;

        switch (type) {
            case "Register":
                resp = { RegisterResponse: { result: "Success" } };
                break;
            case "GetVersion":
                resp = { GetVersionResponse: { version: "1.3.0" } };
                break;
            default:
                return; // no response needed for most messages
        }

        const json = JSON.stringify(resp);
        const buf = Buffer.allocUnsafe(4 + json.length);
        buf.writeUInt32BE(json.length, 0);
        buf.write(json, 4, "utf8");
        socket.write(buf);
    }
}
