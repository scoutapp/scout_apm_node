// OTLP log record serialization and HTTP shipping.
// Sends ExportLogsServiceRequest JSON to Scout's OTLP ingest endpoint.
import * as https from "https";
import * as http from "http";
import * as url from "url";
import * as fs from "fs";
import * as zlib from "zlib";
import { consoleLogFn, isIgnoredLogMessage } from "../types/util";
import { LogLevel } from "../types/enum";

export interface OtlpKeyValue {
    key: string;
    value: { stringValue?: string; intValue?: number; boolValue?: boolean };
}

export interface OtlpLogRecord {
    timeUnixNano: number;
    observedTimeUnixNano: number;
    severityText: string;
    severityNumber: number;
    body: { stringValue: string };
    attributes: OtlpKeyValue[];
    traceId?: string;
    spanId?: string;
}

export interface OtlpShipOptions {
    endpointHttp: string;
    ingestKey: string;
    serviceName: string;
    agentVersion: string;
    logLevel?: LogLevel;
}

// Maps severity level names to OTel SeverityNumber (per OTel Logs Data Model spec).
const SEVERITY_NUMBER: Record<string, number> = {
    trace: 1, debug: 5, info: 9, warn: 13, warning: 13, error: 17, fatal: 21,
};

export function levelToSeverityNumber(level: string): number {
    return SEVERITY_NUMBER[level.toLowerCase()] ?? 9;
}

export function levelToSeverityText(level: string): string {
    const l = level.toLowerCase();
    const map: Record<string, string> = {
        trace: "TRACE", debug: "DEBUG", info: "INFO",
        warn: "WARN", warning: "WARN", error: "ERROR", fatal: "FATAL",
    };
    return map[l] ?? "INFO";
}

// Returns nanoseconds-since-epoch as a number.
// Precision loss beyond 2^53 (~9ms in 2026) is acceptable for log timestamps.
export function nowNanos(): number {
    const ms = Date.now();
    return ms * 1000000;
}

export function buildExportRequest(
    records: OtlpLogRecord[],
    opts: Pick<OtlpShipOptions, "serviceName" | "agentVersion">,
): object {
    return {
        resourceLogs: [{
            resource: {
                attributes: [
                    { key: "service.name", value: { stringValue: opts.serviceName } },
                    { key: "scout.language", value: { stringValue: "node" } },
                    { key: "telemetry.sdk.name", value: { stringValue: "scout_apm_node" } },
                    { key: "telemetry.sdk.version", value: { stringValue: opts.agentVersion } },
                ],
            },
            scopeLogs: [{
                scope: { name: "scout_apm_node", version: opts.agentVersion },
                logRecords: records,
            }],
        }],
    };
}

const GZIP_THRESHOLD_BYTES = 1024;

export function shipLogs(records: OtlpLogRecord[], opts: OtlpShipOptions): void {
    if (records.length === 0) { return; }

    const payload = JSON.stringify(buildExportRequest(records, opts));
    const payloadBuf = Buffer.from(payload, "utf8");
    const parsed = url.parse(opts.endpointHttp);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;
    const port = parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80);

    const configLevel = opts.logLevel ?? LogLevel.Warn;
    const debugEnabled = !isIgnoredLogMessage(configLevel, LogLevel.Debug);
    const ts = new Date().toISOString();

    const shouldGzip = payloadBuf.length > GZIP_THRESHOLD_BYTES;

    const sendRequest = (body: Buffer) => {
        const headers: Record<string, string | number> = {
            "Content-Type": "application/json",
            "Content-Length": body.length,
            "x-telemetryhub-key": opts.ingestKey,
        };
        if (shouldGzip) { headers["Content-Encoding"] = "gzip"; }

        if (debugEnabled) {
            consoleLogFn(`[scout/logs] ${ts} sending ${records.length} record(s) to ${opts.endpointHttp} (${body.length} bytes${shouldGzip ? ", gzipped" : ""})`, LogLevel.Debug);
            try {
                const capture = JSON.stringify({ ts, endpoint: opts.endpointHttp, headers, payload: JSON.parse(payload) }, null, 2);
                fs.writeFileSync("/scout_debug/otlp_payload.json", capture, "utf8");
            } catch { /* ignore write errors */ }
        }

        const req = lib.request({
            hostname: parsed.hostname,
            port,
            path: parsed.path || "/v1/logs",
            method: "POST",
            headers,
        }, (res) => {
            let resBody = "";
            res.on("data", (chunk) => { resBody += chunk; });
            res.on("end", () => {
                if (debugEnabled) { consoleLogFn(`[scout/logs] ${new Date().toISOString()} response ${res.statusCode} from ${opts.endpointHttp}${resBody ? ": " + resBody.slice(0, 200) : ""}`, LogLevel.Debug); }
            });
        });

        req.on("error", (err) => {
            consoleLogFn(`[scout/logs] ${new Date().toISOString()} error shipping to ${opts.endpointHttp}: ${err.message} (${(err as any).code})`, LogLevel.Warn);
        });
        req.write(body);
        req.end();
    };

    if (shouldGzip) {
        zlib.gzip(payloadBuf, (err, compressed) => {
            if (err) {
                consoleLogFn(`[scout/logs] gzip error, sending uncompressed: ${err.message}`, LogLevel.Warn);
                sendRequest(payloadBuf);
            } else {
                sendRequest(compressed);
            }
        });
    } else {
        sendRequest(payloadBuf);
    }
}
