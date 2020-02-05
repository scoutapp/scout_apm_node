"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const lib_1 = require("../../lib");
const types_1 = require("../../lib/types");
const TestUtil = require("../util");
const Constants = require("../../lib/constants");
// https://github.com/scoutapp/scout_apm_node/issues/76
test("spans should have traces attached", t => {
    const scout = new lib_1.Scout(lib_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }), { slowRequestThresholdMs: 50 });
    // Set up a listener for the scout request that gets sent
    const listener = (data) => {
        const request = data.request;
        scout.removeListener(lib_1.ScoutEvent.RequestSent, listener);
        data.request
            .getChildSpans()
            .then(spans => {
            t.equals(spans.length, 1, "one span was present");
            const stack = spans[0].getContextValue(types_1.ScoutContextNames.Traceback);
            t.assert(stack !== null && typeof stack !== "undefined", "traceback context is present on span");
            const scoutTrace = stack.find((s) => s.file.includes("scout_apm_node"));
            t.equals(scoutTrace, undefined, "no scout APM traces");
        })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Set up listener on the agent
    scout.on(lib_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Create the first & second request
        .then(() => scout.transaction("Controller/test-span-trace", finishRequest => {
        return scout.instrument("test-span-trace", stopSpan => {
            return TestUtil.waitMs(Constants.DEFAULT_SLOW_REQUEST_THRESHOLD_MS)
                .then(() => t.pass("span ran after slow request threshold"))
                .then(() => finishRequest());
        });
    }))
        // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// https://github.com/scoutapp/scout_apm_node/issues/107
test("spans within the threshold should not have traces attached", t => {
    const scout = new lib_1.Scout(lib_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Set up a listener for the scout request that gets sent
    const listener = (data) => {
        const request = data.request;
        scout.removeListener(lib_1.ScoutEvent.RequestSent, listener);
        data.request
            .getChildSpans()
            .then(spans => {
            t.equals(spans.length, 1, "one span was present");
            const stack = spans[0].getContextValue(types_1.ScoutContextNames.Traceback);
            t.notOk(stack, "traceback context is not present on span");
        })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Set up listener on the agent
    scout.on(lib_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Create the first & second request
        .then(() => scout.transaction("Controller/test-span-trace", finishRequest => {
        return scout.instrument("test-span-trace", stopSpan => {
            return t.pass("span ran (without delay)");
        })
            .then(() => finishRequest());
    }))
        // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
