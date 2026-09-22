import * as test from "tape";

import {
    enableEventLoopLagMonitor,
    disableEventLoopLagMonitor,
    tagEventLoopLag,
} from "../lib/event-loop-lag";
import { ScoutContextName } from "../lib/types/enum";
import { JSONValue } from "../lib/types";

// Minimal Taggable stand-in that records every addContextSync call.
class FakeTaggable {
    public readonly tags: { [name: string]: JSONValue | JSONValue[] } = {};

    public addContext(name: string, value: JSONValue | JSONValue[]): Promise<this> {
        return Promise.resolve(this.addContextSync(name, value));
    }

    public addContextSync(name: string, value: JSONValue | JSONValue[]): this {
        this.tags[name] = value;
        return this;
    }

    public addContexts(): Promise<this> { return Promise.resolve(this); }
    public addContextsSync(): this { return this; }

    public getContextValue(name: string): JSONValue | JSONValue[] | undefined {
        return this.tags[name];
    }
}

const LAG_KEYS = [
    ScoutContextName.EventLoopLagMeanMS,
    ScoutContextName.EventLoopLagMaxMS,
    ScoutContextName.EventLoopLagP99MS,
];

// Ensure each test starts from a known (disabled) state.
function reset() {
    disableEventLoopLagMonitor();
}

test("tagEventLoopLag is a no-op before the monitor is enabled", t => {
    reset();

    const target = new FakeTaggable();
    tagEventLoopLag(target);

    t.deepEquals(target.tags, {}, "no context added when monitor is disabled");
    t.end();
});

test("enableEventLoopLagMonitor is idempotent and reports active", t => {
    reset();

    t.equals(enableEventLoopLagMonitor(), true, "returns true when monitoring is active");
    t.equals(enableEventLoopLagMonitor(), true, "returns true again on repeat call (idempotent)");

    reset();
    t.end();
});

test("tagEventLoopLag adds lag context once the monitor has a sample", t => {
    reset();
    enableEventLoopLagMonitor();

    // The histogram needs to observe at least one event-loop tick before it
    // yields a finite mean. Give it a couple of turns to collect a sample.
    setTimeout(() => {
        const target = new FakeTaggable();
        tagEventLoopLag(target);

        // mean drives whether we tag at all; if present, values must be sane.
        const mean = target.tags[ScoutContextName.EventLoopLagMeanMS];
        t.notEqual(mean, undefined, "mean lag context was added after a sample");

        LAG_KEYS.forEach(key => {
            const val = target.tags[key];
            if (val !== undefined) {
                t.equals(typeof val, "number", `${key} is a number`);
                t.assert((val as number) >= 0, `${key} is non-negative`);
                t.assert(isFinite(val as number), `${key} is finite`);
            }
        });

        reset();
        t.end();
    }, 50);
});

test("tagEventLoopLag reports milliseconds, not nanoseconds", t => {
    reset();
    enableEventLoopLagMonitor();

    setTimeout(() => {
        const target = new FakeTaggable();
        tagEventLoopLag(target);

        const mean = target.tags[ScoutContextName.EventLoopLagMeanMS] as number | undefined;
        if (mean !== undefined) {
            // A healthy loop's lag is single/double-digit ms. If we accidentally
            // reported raw nanoseconds this would be in the millions.
            t.assert(mean < 10000, "mean lag is in a plausible millisecond range (not raw ns)");
        } else {
            t.pass("no sample collected; ms-range assertion skipped");
        }

        reset();
        t.end();
    }, 50);
});

test("tagEventLoopLag tolerates null/undefined targets", t => {
    reset();
    enableEventLoopLagMonitor();

    t.doesNotThrow(() => tagEventLoopLag(undefined), "undefined target does not throw");
    t.doesNotThrow(() => tagEventLoopLag(null), "null target does not throw");

    reset();
    t.end();
});

test("disableEventLoopLagMonitor stops tagging", t => {
    reset();
    enableEventLoopLagMonitor();
    disableEventLoopLagMonitor();

    const target = new FakeTaggable();
    tagEventLoopLag(target);

    t.deepEquals(target.tags, {}, "no context added after monitor is disabled");
    t.end();
});
