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
exports.ErrorService = void 0;
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const zlib = __importStar(require("zlib"));
const os = __importStar(require("os"));
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
        const batchSize = typeof this.config.errorsBatchSize === "number" ? this.config.errorsBatchSize : 5;
        const batch = this.queue.splice(0, batchSize);
        this.send(batch);
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
