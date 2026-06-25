// In-memory log buffer with periodic flush.
// Inspired by Sentry's log buffer (MIT): https://github.com/getsentry/sentry-javascript/blob/develop/packages/core/src/logs/internal.ts
import { OtlpLogRecord, OtlpShipOptions, shipLogs } from "./otlp";

const MAX_LOG_BUFFER_SIZE = 100;
const FLUSH_INTERVAL_MS = 5000;

export class ScoutLogBuffer {
    private records: OtlpLogRecord[] = [];
    private timer: NodeJS.Timeout | null = null;
    private opts: OtlpShipOptions;

    constructor(opts: OtlpShipOptions) {
        this.opts = opts;
    }

    append(record: OtlpLogRecord): void {
        if (this.records.length >= MAX_LOG_BUFFER_SIZE) {
            this.flush();
        }
        this.records.push(record);
        if (!this.timer) {
            this.timer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS).unref();
        }
    }

    flush(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.records.length === 0) { return; }
        const batch = this.records.splice(0);
        shipLogs(batch, this.opts);
    }

    destroy(): void {
        this.flush();
    }

    updateOpts(opts: Partial<OtlpShipOptions>): void {
        this.opts = { ...this.opts, ...opts };
    }
}
