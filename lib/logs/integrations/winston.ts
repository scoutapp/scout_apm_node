// Winston log integration for Scout APM.
//
// Hook strategy: RITM wraps winston.createLogger to inject ScoutWinstonTransport into every
// new logger. The transport extends winston-transport (TransportStream), which is the standard
// extension point used by all winston transports.
//
// Transport pattern inspired by winston-transport-sentry-node (MIT):
//   https://github.com/aandrewww/winston-transport-sentry-node/blob/master/src/transport.ts
// Hook approach inspired by @opentelemetry/instrumentation-winston (Apache 2.0):
//   https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/instrumentation-winston
import { RequireIntegration, getIntegrationSymbol } from "../../types/integrations";
import { ScoutLogBuffer } from "../buffer";
import { levelToSeverityNumber, levelToSeverityText, nowNanos, getContextAttributes } from "../otlp";

const LEVEL_ORDER = ["trace", "debug", "info", "warn", "error", "fatal"];

function meetsMinLevel(level: string, minLevel: string): boolean {
    const winstonToLevel: Record<string, string> = {
        silly: "trace", verbose: "debug", http: "debug",
    };
    const normalized = winstonToLevel[level.toLowerCase()] ?? level.toLowerCase();
    const minNormalized = winstonToLevel[minLevel.toLowerCase()] ?? minLevel.toLowerCase();
    const idx = LEVEL_ORDER.indexOf(normalized);
    const minIdx = LEVEL_ORDER.indexOf(minNormalized);
    return idx >= (minIdx < 0 ? 1 : minIdx);
}

function buildTransportClass(
    logBuffer: ScoutLogBuffer,
    getScout: () => any,
    minLevel: string,
    TransportStream: any,
): any {
    // LEVEL symbol from triple-beam (bundled with winston) gives the raw, unmapped level name
    let LEVEL_SYM: symbol | null = null;
    try {
        LEVEL_SYM = require("triple-beam").LEVEL as symbol;
    } catch { /* triple-beam not available; fall back to info.level */ }

    return class ScoutWinstonTransport extends TransportStream {
        constructor() {
            super({ level: "silly" }); // capture all levels; filter ourselves
        }

        log(info: any, callback: () => void): void {
            // Emit 'logged' on next tick — required by the winston transport contract
            setImmediate(() => this.emit("logged", info));

            const rawLevel: string = (LEVEL_SYM ? info[LEVEL_SYM] : null) ?? info.level ?? "info";
            if (!meetsMinLevel(rawLevel, minLevel)) { return callback(); }

            const now = nowNanos();
            const scout = getScout();
            const request = scout?.getCurrentRequest?.() ?? null;
            const requestId: string | null = request?.id ?? null;

            // Collect extra fields (excluding message and level) as attributes
            const skip = new Set(["message", "level", "timestamp", "service", "splat"]);
            const extras: Array<{ key: string; value: { stringValue: string } }> = [];
            for (const [k, v] of Object.entries(info)) {
                if (!skip.has(k) && typeof k === "string" && v !== undefined) {
                    extras.push({ key: k, value: { stringValue: String(v) } });
                }
            }

            logBuffer.append({
                timeUnixNano: now,
                observedTimeUnixNano: now,
                severityText: levelToSeverityText(rawLevel),
                severityNumber: levelToSeverityNumber(rawLevel),
                body: { stringValue: typeof info.message === "string" ? info.message : JSON.stringify(info.message) },
                attributes: [
                    { key: "logger.name", value: { stringValue: "winston" } },
                    ...(requestId ? [{ key: "scout_transaction_id", value: { stringValue: requestId } }] : []),
                    ...getContextAttributes(request),
                    ...extras,
                ],
            });

            callback();
        }
    };
}

export class WinstonIntegration extends RequireIntegration {
    protected readonly packageName: string = "winston";

    private logBuffer: ScoutLogBuffer | null = null;
    private minLevel: string = "debug";

    setLogBuffer(buf: ScoutLogBuffer, captureLevel: string): void {
        this.logBuffer = buf;
        this.minLevel = captureLevel;
    }

    protected shim(winstonExport: any): any {
        if (!winstonExport?.createLogger) { return winstonExport; }

        const TransportStream = (() => {
            try { return require("winston-transport"); } catch { return null; }
        })();
        if (!TransportStream) { return winstonExport; }

        const buf = this.logBuffer;
        const minLvl = this.minLevel;
        const integration = this;

        const ScoutTransportClass = buildTransportClass(
            buf!,
            () => integration.scout,
            minLvl,
            TransportStream,
        );

        winstonExport[getIntegrationSymbol()] = this;

        const originalCreateLogger = winstonExport.createLogger;
        winstonExport.createLogger = function(...args: any[]) {
            const logger = originalCreateLogger.apply(this, args);
            if (buf) {
                logger.add(new ScoutTransportClass());
            }
            return logger;
        };

        return winstonExport;
    }
}

export default new WinstonIntegration();
