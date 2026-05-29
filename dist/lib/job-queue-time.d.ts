import ScoutRequest from "./scout/request";
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
export declare function trackJobQueueTime(request: ScoutRequest, enqueuedAt: Date | number): void;
