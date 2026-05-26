"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorService = void 0;
const tslib_1 = require("tslib");
const https = tslib_1.__importStar(require("https"));
const http = tslib_1.__importStar(require("http"));
const zlib = tslib_1.__importStar(require("zlib"));
const os = tslib_1.__importStar(require("os"));
const url_1 = require("url");
const MAX_QUEUE = 500;
const FLUSH_INTERVAL_MS = 1000;
class ErrorService {
    constructor(config) {
        this.queue = [];
        this.timer = null;
        this.config = config;
    }
    start() {
        if (this.timer) {
            return;
        }
        this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
        // Don't block process exit
        if (this.timer.unref) {
            this.timer.unref();
        }
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    enqueue(error) {
        if (this.queue.length >= MAX_QUEUE) {
            this.queue.shift();
        }
        this.queue.push(error);
        // Flush immediately so uncaughtException errors are shipped before process exit
        this.flush();
    }
    flush() {
        if (this.queue.length === 0) {
            return;
        }
        this.send(this.queue.splice(0));
    }
    send(errors) {
        const host = this.config.errorsHost || "https://errors.scoutapm.com";
        const key = this.config.key || "";
        const name = this.config.name || "";
        const agentHostname = this.config.hostname || os.hostname();
        const body = JSON.stringify({
            notifier: "scout_apm_node",
            environment: this.config.environment || "",
            root: this.config.applicationRoot || "",
            problems: errors,
        });
        if (this.config.logPayloadContent) {
            // tslint:disable-next-line no-console
            console.log(`[scout/error-payload] ${body}`);
        }
        zlib.gzip(Buffer.from(body, "utf8"), (gzipErr, compressed) => {
            if (gzipErr) {
                return;
            }
            let parsedUrl;
            try {
                parsedUrl = new url_1.URL(`${host}/apps/error.scout`);
            }
            catch {
                return;
            }
            parsedUrl.searchParams.set("key", key);
            parsedUrl.searchParams.set("name", name);
            const isHttps = parsedUrl.protocol === "https:";
            const transport = isHttps ? https : http;
            const defaultPort = isHttps ? 443 : 80;
            const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : defaultPort;
            const options = {
                hostname: parsedUrl.hostname,
                port,
                path: parsedUrl.pathname + parsedUrl.search,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Encoding": "gzip",
                    "Content-Length": compressed.length,
                    "Agent-Hostname": agentHostname,
                    "X-Error-Count": String(errors.length),
                },
            };
            const req = transport.request(options, (res) => {
                res.resume();
            });
            req.on("error", () => { });
            req.write(compressed);
            req.end();
        });
    }
}
exports.ErrorService = ErrorService;
