import * as https from "https";
import * as http from "http";
import * as zlib from "zlib";
import * as os from "os";
import { URL } from "url";
import { ScoutConfiguration } from "./types";

const MAX_QUEUE = 500;
const FLUSH_INTERVAL_MS = 1000;

export interface RequestComponents {
    module?: string | null;
    controller?: string | null;
    action?: string | null;
}

export interface ErrorPayload {
    exception_class: string;
    message: string;
    request_id?: string;
    request_uri?: string;
    request_params?: object | null;
    request_session?: object | null;
    environment?: object | null;
    trace: string[];
    request_components?: RequestComponents | null;
    context?: object;
    host: string;
    revision_sha?: string;
}

export class ErrorService {
    private queue: ErrorPayload[] = [];
    private timer: ReturnType<typeof setInterval> | null = null;
    private config: Partial<ScoutConfiguration>;

    constructor(config: Partial<ScoutConfiguration>) {
        this.config = config;
    }

    public start(): void {
        if (this.timer) { return; }
        this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
        // Don't block process exit
        if (this.timer.unref) { this.timer.unref(); }
    }

    public stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    public enqueue(error: ErrorPayload): void {
        if (this.queue.length >= MAX_QUEUE) {
            this.queue.shift();
        }
        this.queue.push(error);
        // Flush immediately so uncaughtException errors are shipped before process exit
        this.flush();
    }

    private flush(): void {
        if (this.queue.length === 0) { return; }
        this.send(this.queue.splice(0));
    }

    private send(errors: ErrorPayload[]): void {
        const host = (this.config.errorsHost as string) || "https://errors.scoutapm.com";
        const key = this.config.key || "";
        const name = this.config.name || "";
        const agentHostname = (this.config.hostname as string) || os.hostname();

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
            if (gzipErr) { return; }

            let parsedUrl: URL;
            try {
                parsedUrl = new URL(`${host}/apps/error.scout`);
            } catch {
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

            req.on("error", () => { /* swallow network errors */ });
            req.write(compressed);
            req.end();
        });
    }
}
