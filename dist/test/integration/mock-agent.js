"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockAgent = void 0;
const fs = __importStar(require("fs"));
const net = __importStar(require("net"));
const path = __importStar(require("path"));
const events_1 = require("events");
// Scout protocol responses use the same outer key as the request message type.
// Special case: GetVersion responses use "CoreAgentVersion" as the key.
const RESPONSE_OVERRIDE = {
    GetVersion: { CoreAgentVersion: "v1.3.0" },
};
/**
 * MockAgent creates a TCP server that mimics a core-agent socket.
 * It captures all Scout protocol messages sent by the agent for test assertions.
 */
class MockAgent extends events_1.EventEmitter {
    constructor() {
        super();
        this.sockets = new Set();
        this.messages = [];
        this.port = 0;
        this.server = net.createServer((socket) => {
            this.sockets.add(socket);
            socket.once("close", () => this.sockets.delete(socket));
            this.handleConnection(socket);
        });
    }
    start() {
        return new Promise((resolve, reject) => {
            this.server.listen(0, "127.0.0.1", () => {
                const addr = this.server.address();
                this.port = addr.port;
                resolve();
            });
            this.server.once("error", reject);
        });
    }
    stop() {
        // Destroy all open sockets so the server can close immediately
        this.sockets.forEach((s) => s.destroy());
        this.sockets.clear();
        return new Promise((resolve) => {
            this.server.close(() => resolve());
        });
    }
    getMessages() {
        return this.messages.slice();
    }
    getMessagesByType(type) {
        return this.messages.filter((m) => m.type === type);
    }
    /** Write all captured messages to a JSON file for inspection. Creates parent dirs as needed. */
    dumpToFile(filePath) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(this.messages, null, 2), "utf8");
    }
    waitForMessage(type, timeoutMs = 3000) {
        return new Promise((resolve, reject) => {
            const existing = this.messages.find((m) => m.type === type);
            if (existing) {
                return resolve(existing);
            }
            const timer = setTimeout(() => {
                this.removeListener("message", listener);
                reject(new Error(`Timed out waiting for message type: ${type}`));
            }, timeoutMs);
            const listener = (msg) => {
                if (msg.type !== type) {
                    return;
                }
                clearTimeout(timer);
                this.removeListener("message", listener);
                resolve(msg);
            };
            this.on("message", listener);
        });
    }
    socketPath() {
        return `tcp://127.0.0.1:${this.port}`;
    }
    handleConnection(socket) {
        const chunks = [];
        socket.on("data", (chunk) => {
            chunks.push(chunk);
            const buf = Buffer.concat(chunks);
            chunks.length = 0;
            const remaining = this.processBuffer(buf, socket);
            if (remaining.length > 0) {
                chunks.push(remaining);
            }
        });
        socket.on("error", () => socket.destroy());
    }
    processBuffer(buf, socket) {
        while (buf.length >= 4) {
            const msgLen = buf.readUInt32BE(0);
            if (buf.length < 4 + msgLen) {
                break;
            }
            const msgBytes = buf.subarray(4, 4 + msgLen);
            buf = buf.subarray(4 + msgLen);
            try {
                const parsed = JSON.parse(msgBytes.toString("utf8"));
                const type = this.extractMessageType(parsed);
                const msg = { type, raw: parsed };
                this.messages.push(msg);
                this.emit("message", msg);
                // Send a minimal success response
                this.sendResponse(socket, type);
            }
            catch {
                // ignore parse errors in mock
            }
        }
        return buf;
    }
    extractMessageType(parsed) {
        if (parsed && typeof parsed === "object") {
            // Scout protocol wraps messages like: { "Register": { ... } }
            const keys = Object.keys(parsed);
            if (keys.length > 0) {
                return keys[0];
            }
        }
        return "Unknown";
    }
    sendResponse(socket, type) {
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
exports.MockAgent = MockAgent;
