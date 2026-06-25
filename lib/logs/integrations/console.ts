// Console log integration for Scout APM.
// Patches global console methods to forward log entries to the Scout log buffer.
// Active when logs_monitor=true and logs_capture_console=true (default).
import { ScoutLogBuffer } from "../buffer";
import { levelToSeverityNumber, levelToSeverityText, nowNanos } from "../otlp";

const CONSOLE_LEVELS: Array<[keyof Console, string]> = [
    ["log",   "info"],
    ["info",  "info"],
    ["debug", "debug"],
    ["warn",  "warn"],
    ["error", "error"],
    ["trace", "trace"],
];

const LEVEL_ORDER = ["trace", "debug", "info", "warn", "error", "fatal"];

function meetsMinLevel(level: string, minLevel: string): boolean {
    return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(minLevel.toLowerCase() || "debug");
}

let patched = false;
const originals: Partial<Record<keyof Console, (...args: any[]) => void>> = {};

export function setupConsoleIntegration(
    logBuffer: ScoutLogBuffer,
    getScout: () => any,
    captureLevel: string,
): void {
    if (patched) { return; }
    patched = true;

    for (const [method, level] of CONSOLE_LEVELS) {
        const original = (console[method] as (...args: any[]) => void).bind(console);
        originals[method] = original;

        (console as any)[method] = (...args: any[]) => {
            original(...args);
            if (!meetsMinLevel(level, captureLevel)) { return; }

            const now = nowNanos();
            const scout = getScout();
            const requestId: string | null = scout?.getCurrentSpan?.()?.id ?? null;

            logBuffer.append({
                timeUnixNano: now,
                observedTimeUnixNano: now,
                severityText: levelToSeverityText(level),
                severityNumber: levelToSeverityNumber(level),
                body: {
                    stringValue: args
                        .map(a => (typeof a === "string" ? a : JSON.stringify(a)))
                        .join(" "),
                },
                attributes: [
                    { key: "logger.name", value: { stringValue: "console" } },
                    ...(requestId ? [{ key: "scout.request_id", value: { stringValue: requestId } }] : []),
                ],
            });
        };
    }
}

export function teardownConsoleIntegration(): void {
    if (!patched) { return; }
    for (const [method] of CONSOLE_LEVELS) {
        if (originals[method]) {
            (console as any)[method] = originals[method];
        }
    }
    patched = false;
}
