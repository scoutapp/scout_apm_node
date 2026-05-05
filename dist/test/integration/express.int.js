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
const supertest_1 = __importDefault(require("supertest"));
const mock_agent_1 = require("./mock-agent");
const express_1 = require("../../lib/express");
const lib_1 = require("../../lib");
const types_1 = require("../../lib/types");
const TestUtil = __importStar(require("../util"));
(0, lib_1.setupRequireIntegrations)(["pug", "ejs", "mustache"]);
const TIMEOUT = 8000;
function buildScoutWithMock(mock, extra) {
    return (0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: mock.socketPath(),
        ...extra,
    });
}
/**
 * Wait for the next ScoutEvent.RequestSent, draining one event first if skipOne is true.
 * This handles the warmup request pattern where the first request initializes Scout
 * but we care about the assertions on the second request.
 */
function nextRequestSent(scout, skipCount = 0) {
    return new Promise((resolve, reject) => {
        let skipped = 0;
        const timer = setTimeout(() => {
            scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
            reject(new Error("Timed out waiting for ScoutEvent.RequestSent"));
        }, TIMEOUT - 1000);
        const listener = (data) => {
            if (skipped < skipCount) {
                skipped++;
                return;
            }
            clearTimeout(timer);
            scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
            resolve(data);
        };
        scout.on(types_1.ScoutEvent.RequestSent, listener);
    });
}
function makeApp(mock, factory, extra) {
    return factory((0, express_1.scoutMiddleware)({
        config: buildScoutWithMock(mock, extra),
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }));
}
(0, tape_1.default)("Express GET / creates a Controller span", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let app;
    let scout;
    mock.start()
        .then(() => {
        app = makeApp(mock, (mw) => TestUtil.simpleExpressApp(mw));
        // Set up listener BEFORE warmup request to capture events in order
        const warmupDone = (0, supertest_1.default)(app).get("/").expect(200);
        return warmupDone;
    })
        .then(() => {
        scout = app.scout;
        // Warmup RequestSent may or may not have fired yet — skip 1 to get next request's event
        const sentPromise = nextRequestSent(scout, 1);
        (0, supertest_1.default)(app).get("/").end(() => undefined);
        return sentPromise;
    })
        .then((data) => {
        const spans = data.request.getChildSpansSync();
        const controllerSpan = spans.find((s) => s.operation.startsWith("Controller/"));
        t.ok(controllerSpan, "Controller span was created");
        t.ok(controllerSpan && controllerSpan.operation.includes("GET"), "Controller span includes HTTP method");
        return TestUtil.shutdownScout(t, scout);
    })
        .then(() => mock.stop())
        .catch((err) => {
        mock.stop().catch(() => undefined);
        t.fail(err.message);
        t.end();
    });
});
(0, tape_1.default)("Express dynamic route captures route pattern", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let app;
    let scout;
    mock.start()
        .then(() => {
        app = makeApp(mock, (mw) => TestUtil.simpleDynamicSegmentExpressApp(mw));
        return (0, supertest_1.default)(app).get("/").expect(200);
    })
        .then(() => {
        scout = app.scout;
        const sentPromise = nextRequestSent(scout, 1);
        (0, supertest_1.default)(app).get("/dynamic/hello").end(() => undefined);
        return sentPromise;
    })
        .then((data) => {
        const spans = data.request.getChildSpansSync();
        const controllerSpan = spans.find((s) => s.operation.startsWith("Controller/"));
        t.ok(controllerSpan, "Controller span present for dynamic route");
        t.ok(controllerSpan && controllerSpan.operation.includes(":segment"), `Route pattern captured — operation: ${controllerSpan?.operation}`);
        return TestUtil.shutdownScout(t, scout);
    })
        .then(() => mock.stop())
        .catch((err) => {
        mock.stop().catch(() => undefined);
        t.fail(err.message);
        t.end();
    });
});
(0, tape_1.default)("Express error response is tagged on the request", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let app;
    let scout;
    mock.start()
        .then(() => {
        app = makeApp(mock, (mw) => TestUtil.simpleErrorApp(mw));
        // First request to "/" initializes Scout (it will error, but that's ok)
        return (0, supertest_1.default)(app).get("/");
    })
        .then(() => {
        scout = app.scout;
        const sentPromise = nextRequestSent(scout, 1);
        (0, supertest_1.default)(app).get("/").end(() => undefined);
        return sentPromise;
    })
        .then((data) => {
        const errValue = data.request.getContextValue("error");
        t.ok(errValue !== undefined, "error context set on request");
        t.equal(errValue, "true", "error context value is 'true'");
        return TestUtil.shutdownScout(t, scout);
    })
        .then(() => mock.stop())
        .catch((err) => {
        mock.stop().catch(() => undefined);
        t.fail(err.message);
        t.end();
    });
});
(0, tape_1.default)("Mock agent receives Register message on connect", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let capturedScout;
    mock.start()
        .then(() => {
        const app = makeApp(mock, (mw) => TestUtil.simpleExpressApp(mw), { name: "test-app", key: "test-key" });
        return (0, supertest_1.default)(app).get("/").expect(200)
            .then(() => { capturedScout = app.scout; });
    })
        .then(() => mock.waitForMessage("Register"))
        .then((msg) => {
        t.ok(msg, "Register message received by mock agent");
        t.equal(msg.type, "Register", "message type is Register");
    })
        .then(() => mock.stop())
        .then(() => {
        if (capturedScout) {
            return capturedScout.shutdown();
        }
    })
        .then(() => t.end())
        .catch((err) => {
        mock.stop().catch(() => undefined);
        t.fail(err.message);
        t.end();
    });
});
