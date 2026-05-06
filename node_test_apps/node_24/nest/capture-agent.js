/**
 * In-process TCP server that speaks the Scout wire protocol.
 * Scout connects to this instead of the real core-agent.
 * Every message is stored via store.js and acknowledged.
 */
const net = require("net");
const { saveMessage } = require("./store");

const RESPONSE_OVERRIDE = {
    GetVersion: { CoreAgentVersion: "v1.3.0" },
};

class CaptureAgent {
    constructor() {
        this.server = net.createServer((socket) => this._handleConnection(socket));
        this.port = 0;
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server.listen(0, "127.0.0.1", () => {
                this.port = this.server.address().port;
                console.log(`[capture-agent] listening on port ${this.port}`);
                resolve();
            });
            this.server.once("error", reject);
        });
    }

    stop() {
        return new Promise((resolve) => this.server.close(resolve));
    }

    socketPath() {
        return `tcp://127.0.0.1:${this.port}`;
    }

    _handleConnection(socket) {
        const chunks = [];
        socket.on("data", (chunk) => {
            chunks.push(chunk);
            const buf = Buffer.concat(chunks);
            chunks.length = 0;
            const remaining = this._processBuffer(buf, socket);
            if (remaining.length > 0) chunks.push(remaining);
        });
        socket.on("error", () => socket.destroy());
    }

    _processBuffer(buf, socket) {
        while (buf.length >= 4) {
            const msgLen = buf.readUInt32BE(0);
            if (buf.length < 4 + msgLen) break;

            const msgBytes = buf.subarray(4, 4 + msgLen);
            buf = buf.subarray(4 + msgLen);

            try {
                const parsed = JSON.parse(msgBytes.toString("utf8"));
                const type = Object.keys(parsed)[0] || "Unknown";
                const requestId = this._extractRequestId(type, parsed[type]);

                // Persist asynchronously — don't block the socket
                saveMessage(type, requestId, parsed).catch(() => undefined);

                // Respond immediately
                const resp = RESPONSE_OVERRIDE[type] || { [type]: { result: "Success" } };
                const json = JSON.stringify(resp);
                const jsonBuf = Buffer.from(json, "utf8");
                const lenBuf = Buffer.allocUnsafe(4);
                lenBuf.writeUInt32BE(jsonBuf.length, 0);
                socket.write(Buffer.concat([lenBuf, jsonBuf]));
            } catch {
                // ignore parse errors
            }
        }
        return buf;
    }

    _extractRequestId(type, body) {
        if (!body || typeof body !== "object") return null;
        // Most Scout messages have request_id at the top level of the body
        return body.request_id || body.RequestId || null;
    }
}

module.exports = { CaptureAgent };
