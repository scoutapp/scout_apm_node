"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackJobQueueTime = void 0;
const enum_1 = require("./types/enum");
/**
 * Tag a background job request with how long it waited in the queue before
 * being picked up. Scout displays this as "Queue Latency" in the background
 * jobs UI.
 *
 * `enqueuedAt` can be any of:
 *   - a `Date` object
 *   - milliseconds since epoch (integer > 1e12)
 *   - seconds since epoch (float < 1e12)
 *   - nanoseconds since epoch (integer > 1e18)
 *
 * Example (BullMQ):
 *   const job = await queue.getJob(jobId);
 *   trackJobQueueTime(request, job.timestamp); // BullMQ timestamps are ms
 *
 * Example (manual):
 *   trackJobQueueTime(request, new Date(payload.enqueuedAt));
 */
function trackJobQueueTime(request, enqueuedAt) {
    const nowNs = Date.now() * 1e6;
    const startNs = toNanoseconds(enqueuedAt);
    const queueTimeNs = Math.max(0, Math.round(nowNs - startNs));
    request.addContextSync(enum_1.ScoutContextName.JobQueueTimeNS, queueTimeNs);
}
exports.trackJobQueueTime = trackJobQueueTime;
function toNanoseconds(value) {
    if (value instanceof Date) {
        return value.getTime() * 1e6;
    }
    // nanoseconds  (> year 2001 in ns = 1e18)
    if (value > 1e18) {
        return value;
    }
    // milliseconds (> year 2001 in ms = 1e12)
    if (value > 1e12) {
        return value * 1e6;
    }
    // seconds (float or int)
    return value * 1e9;
}
