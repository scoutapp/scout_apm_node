// OTLP log record serialization and HTTP shipping.
// Sends ExportLogsServiceRequest JSON to Scout's OTLP ingest endpoint.
import * as https from "https";
import * as http from "http";
import * as url from "url";

export interface OtlpKeyValue {
    key: string;
    value: { stringValue?: string; intValue?: number; boolValue?: boolean };
}

export interface OtlpLogRecord {
    timeUnixNano: string;
    observedTimeUnixNano: string;
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

// Returns nanoseconds-since-epoch as a decimal string without BigInt literals
// (which require ES2020 and would break the ES6 build target).
export function nowNanos(): string {
    const ms = Date.now();
    const sec = Math.floor(ms / 1000);
    const nsRem = (ms % 1000) * 1000000;
    return String(sec) + String(nsRem).padStart(9, "0");
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

export function shipLogs(records: OtlpLogRecord[], opts: OtlpShipOptions): void {
    if (records.length === 0) { return; }

    const payload = JSON.stringify(buildExportRequest(records, opts));
    const parsed = url.parse(opts.endpointHttp);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;
    const port = parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80);

    const req = lib.request({
        hostname: parsed.hostname,
        port,
        path: parsed.path || "/v1/logs",
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
            "x-telemetry-key": opts.ingestKey,
        },
    }, (res) => {
        res.resume(); // drain response
    });

    req.on("error", () => { /* fire-and-forget; buffer will retry next flush */ });
    req.write(payload);
    req.end();
}
