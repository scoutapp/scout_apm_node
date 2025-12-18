"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tape_1 = __importDefault(require("tape"));
const scout_1 = require("../../lib/scout");
const types_1 = require("../../lib/types");
const TestUtil = __importStar(require("../util"));
const Constants = __importStar(require("../../lib/constants"));
// https://github.com/scoutapp/scout_apm_node/issues/76
(0, tape_1.default)("spans should have traces attached", t => {
    const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
        logFilePath: "/tmp/scout.log",
    }), { slowRequestThresholdMs: 50 });
    // Set up a listener for the scout request that gets sent
    const listener = (data) => {
        const request = data.request;
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        data.request
            .getChildSpans()
            .then(spans => {
            t.equals(spans.length, 1, "one span was present");
            const stack = spans[0].getContextValue(types_1.ScoutContextName.Traceback);
            t.assert(stack !== null && typeof stack !== "undefined", "traceback context is present on span");
            const scoutTrace = stack.find((s) => s.file.includes("scout_apm_node"));
            t.equals(scoutTrace, undefined, "no scout APM traces");
        })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Set up listener on the agent
    scout.on(types_1.ScoutEvent.RequestSent, listener);
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
(0, tape_1.default)("spans within the threshold should not have traces attached", t => {
    const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
    }));
    // Set up a listener for the scout request that gets sent
    const listener = (data) => {
        const request = data.request;
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        data.request
            .getChildSpans()
            .then(spans => {
            t.equals(spans.length, 1, "one span was present");
            const stack = spans[0].getContextValue(types_1.ScoutContextName.Traceback);
            t.notOk(stack, "traceback context is not present on span");
        })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Set up listener on the agent
    scout.on(types_1.ScoutEvent.RequestSent, listener);
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
// https://github.com/scoutapp/scout_apm_node/issues/186
(0, tape_1.default)("transactions created automatically if not present", t => {
    const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
    }));
    // Set up a listener for the scout request that gets sent
    const listener = (data) => {
        const request = data.request;
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // A request (transaction) should have been sent
        t.pass("a request was sent");
        // Ensure that only one span was present
        data.request
            .getChildSpans()
            .then(spans => t.equals(spans.length, 1, "one span was present"))
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Set up listener on the agent
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Create the first & second request
        .then(() => {
        return scout.instrument("test-span-trace", stopSpan => {
            t.pass("span ran (without delay)");
            stopSpan();
        });
    })
        // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
