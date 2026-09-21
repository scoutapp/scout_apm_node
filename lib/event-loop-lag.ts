import { ScoutContextName } from "./types/enum";
import { Taggable } from "./types/util";

/**
 * Event-loop-lag sampling.
 *
 * Uses Node's built-in `perf_hooks.monitorEventLoopDelay()` histogram, which
 * samples event-loop delay in the background with negligible overhead. The
 * histogram accumulates continuously (rolling) — we never reset it, so the
 * values reported on a request/job reflect the long-run distribution of loop
 * lag observed by this process rather than a single request window. This is
 * concurrency-safe: overlapping requests all read the same shared histogram.
 *
 * The histogram is enabled once, lazily, when {@link enableEventLoopLagMonitor}
 * is called during Scout setup. On Node versions without
 * `monitorEventLoopDelay` (< 11.10.0) the feature silently no-ops.
 */

interface EventLoopDelayHistogram {
    enable(): boolean;
    disable(): boolean;
    reset(): void;
    // All values are in nanoseconds.
    readonly mean: number;
    readonly max: number;
    percentile(percentile: number): number;
}

let histogram: EventLoopDelayHistogram | null = null;

/**
 * Enable the shared event-loop-lag histogram. Safe to call multiple times —
 * subsequent calls are no-ops. Returns true if monitoring is active.
 */
export function enableEventLoopLagMonitor(): boolean {
    if (histogram) { return true; }

    let monitorEventLoopDelay: ((opts?: { resolution?: number }) => EventLoopDelayHistogram) | undefined;
    try {
        // Loaded lazily so bundlers / old Node versions don't choke at import time.
        monitorEventLoopDelay = require("perf_hooks").monitorEventLoopDelay;
    } catch (err) {
        return false;
    }

    if (typeof monitorEventLoopDelay !== "function") { return false; }

    const h = monitorEventLoopDelay({ resolution: 20 });
    h.enable();
    histogram = h;
    return true;
}

/**
 * Disable and clear the shared histogram (used on Scout shutdown).
 */
export function disableEventLoopLagMonitor(): void {
    if (histogram) {
        histogram.disable();
        histogram = null;
    }
}

/** Nanoseconds → milliseconds, rounded to 3 decimals. Returns undefined for non-finite input. */
function nsToMs(ns: number): number | undefined {
    if (!isFinite(ns) || ns < 0) { return undefined; }
    return Math.round((ns / 1e6) * 1000) / 1000;
}

/**
 * Add rolling event-loop-lag context (mean / max / p99, in milliseconds) to a
 * request or span. No-op if monitoring was never enabled or the histogram has
 * not yet collected a sample. Never throws.
 */
export function tagEventLoopLag(target: Taggable | undefined | null): void {
    if (!target || !histogram) { return; }

    try {
        const mean = nsToMs(histogram.mean);
        const max = nsToMs(histogram.max);
        const p99 = nsToMs(histogram.percentile(99));

        // Before the first sample, mean is 0 and max/percentile can be non-finite.
        if (mean === undefined) { return; }

        target.addContextSync(ScoutContextName.EventLoopLagMeanMS, mean);
        if (max !== undefined) { target.addContextSync(ScoutContextName.EventLoopLagMaxMS, max); }
        if (p99 !== undefined) { target.addContextSync(ScoutContextName.EventLoopLagP99MS, p99); }
    } catch (err) {
        // Sampling is best-effort; never let it break a request.
    }
}
