// Pino log integration for Scout APM.
//
// Hook strategy: subscribes to diagnostics_channel 'pino_asJson' tracing channel (.end event),
// which fires in the main thread after each log record is fully serialized — no module patching needed.
// Approach inspired by Sentry's pino integration (MIT):
//   https://github.com/getsentry/sentry-javascript/blob/a8de444/packages/node-core/src/integrations/pino.ts
//
// Requires: pino >=v8.0.0, Node >=18.19.0 or >=20.6.0 (diagnostics_channel tracing channels).
import * as diagnosticsChannel from "node:diagnostics_channel";
import { ScoutLogBuffer } from "../buffer";
import { levelToSeverityNumber, levelToSeverityText, nowNanos, getContextAttributes } from "../otlp";

type LevelMapping = { labels: Record<number, string> };
type PinoInstance = { levels?: LevelMapping };

let buffer: ScoutLogBuffer | null = null;
let getScout: (() => any) | null = null;
let minLevel: string = "debug";

const LEVEL_ORDER = ["trace", "debug", "info", "warn", "error", "fatal"];

function meetsMinLevel(level: string): boolean {
    const idx = LEVEL_ORDER.indexOf(level.toLowerCase());
    const minIdx = LEVEL_ORDER.indexOf(minLevel.toLowerCase());
    return idx >= minIdx;
}

export function setupPinoIntegration(
    logBuffer: ScoutLogBuffer,
    getScoutFn: () => any,
    captureLevel: string,
): void {
    buffer = logBuffer;
    getScout = getScoutFn;
    minLevel = captureLevel;

    // tracingChannel requires Node 18.19+ / 20.6+; skip gracefully on older runtimes.
    if (typeof (diagnosticsChannel as any).tracingChannel !== "function") { return; }

    const ch = (diagnosticsChannel as any).tracingChannel("pino_asJson");
    ch.end.subscribe((data: any) => {
        if (!buffer) { return; }

        const { instance, arguments: args, result } = data as {
            instance: PinoInstance;
            arguments: [unknown, string, number];
            result: string;
        };

        const levelNumber: number = args[2];
        const level: string = instance?.levels?.labels?.[levelNumber] ?? "info";

        if (!meetsMinLevel(level)) { return; }

        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(result); } catch { return; }

        const now = nowNanos();
        const scout = getScout?.();
        const request = scout?.getCurrentRequest?.() ?? null;
        const requestId = request?.id ?? null;

        buffer.append({
            timeUnixNano: now,
            observedTimeUnixNano: now,
            severityText: levelToSeverityText(level),
            severityNumber: levelToSeverityNumber(level),
            body: { stringValue: String(parsed.msg ?? "") },
            attributes: [
                { key: "logger.name", value: { stringValue: "pino" } },
                ...(requestId ? [{ key: "scout_transaction_id", value: { stringValue: requestId } }] : []),
                ...getContextAttributes(request),
            ],
        });
    });
}
