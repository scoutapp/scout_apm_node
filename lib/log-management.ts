// Orchestrates Scout log management: initializes the buffer, wires up integrations.
// Called from global.ts after Scout configuration is resolved.
import { ScoutConfiguration } from "./types";
import { ScoutLogBuffer } from "./logs/buffer";
import { setupPinoIntegration } from "./logs/integrations/pino";
import { setupConsoleIntegration } from "./logs/integrations/console";
import winstonIntegration from "./logs/integrations/winston";

let logBuffer: ScoutLogBuffer | null = null;

export function setupLogManagement(
    config: Partial<ScoutConfiguration>,
    getScout: () => any,
): void {
    if (!config.logsMonitor) { return; }

    const endpointHttp = config.logsReportingEndpointHttp || "https://otlp.scoutotel.com:4318/v1/logs";
    const ingestKey = config.logsIngestKey || "";
    const serviceName = config.name || "scout-node-app";
    const captureLevel = config.logsCaptureLevel || "debug";

    // Dynamic import of package.json for version — fallback to empty string
    let agentVersion = "";
    try {
        agentVersion = require("../package.json").version || "";
    } catch { /* ignore */ }

    if (logBuffer) {
        logBuffer.updateOpts({ endpointHttp, ingestKey, serviceName, agentVersion });
    } else {
        logBuffer = new ScoutLogBuffer({ endpointHttp, ingestKey, serviceName, agentVersion });
    }

    // Wire winston integration (RITM hook already set up; needs the buffer reference)
    winstonIntegration.setLogBuffer(logBuffer, captureLevel);

    // Pino: diagnostics_channel, no RITM needed
    setupPinoIntegration(logBuffer, getScout, captureLevel);

    // Console: patch global console methods if enabled (default true)
    if (config.logsCaptureConsole !== false) {
        setupConsoleIntegration(logBuffer, getScout, captureLevel);
    }
}

export function getLogBuffer(): ScoutLogBuffer | null {
    return logBuffer;
}
