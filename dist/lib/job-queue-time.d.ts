import ScoutSpan from "./scout/span";
/**
 * Tag a background job span with how long it waited in the queue before
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
 *   trackJobQueueTime(span, job.timestamp); // BullMQ timestamps are ms
 *
 * Example (manual):
 *   trackJobQueueTime(span, new Date(payload.enqueuedAt));
 */
export declare function trackJobQueueTime(span: ScoutSpan, enqueuedAt: Date | number): void;
