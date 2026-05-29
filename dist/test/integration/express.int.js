"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const request = require("supertest");
const mock_agent_1 = require("./mock-agent");
const express_1 = require("../../lib/express");
const lib_1 = require("../../lib");
const types_1 = require("../../lib/types");
const scout_1 = require("../../lib/scout");
const TestUtil = require("../util");
(0, lib_1.setupRequireIntegrations)(["pug", "ejs", "mustache"]);
const TIMEOUT = 15000;
function buildScoutWithMock(mock, extra) {
    return (0, types_1.buildScoutConfiguration)(Object.assign({ monitor: true, coreAgentDownload: false, coreAgentLaunch: false, socketPath: mock.socketPath() }, extra));
}
function nextRequestSent(scout) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
            reject(new Error("Timed out waiting for ScoutEvent.RequestSent"));
        }, TIMEOUT - 2000);
        const listener = (data) => {
            if (!data.request.getChildSpansSync().some((s) => s.operation.startsWith("Controller/"))) {
                return;
            }
            clearTimeout(timer);
            scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
            resolve(data);
        };
        scout.on(types_1.ScoutEvent.RequestSent, listener);
    });
}
function makeApp(scout, factory) {
    return factory((0, express_1.scoutMiddleware)({
        scout,
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }));
}
test("Express GET / creates a Controller span", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let scout;
    mock.start()
        .then(() => {
        scout = new scout_1.Scout(buildScoutWithMock(mock));
        return scout.setup();
    })
        .then(() => {
        const app = makeApp(scout, (mw) => TestUtil.simpleExpressApp(mw));
        const sentPromise = nextRequestSent(scout);
        request(app).get("/").end(() => undefined);
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
test("Express dynamic route captures route pattern", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let scout;
    mock.start()
        .then(() => {
        scout = new scout_1.Scout(buildScoutWithMock(mock));
        return scout.setup();
    })
        .then(() => {
        const app = makeApp(scout, (mw) => TestUtil.simpleDynamicSegmentExpressApp(mw));
        const sentPromise = nextRequestSent(scout);
        request(app).get("/dynamic/hello").end(() => undefined);
        return sentPromise;
    })
        .then((data) => {
        const spans = data.request.getChildSpansSync();
        const controllerSpan = spans.find((s) => s.operation.startsWith("Controller/"));
        t.ok(controllerSpan, "Controller span present for dynamic route");
        t.ok(controllerSpan && controllerSpan.operation.includes(":segment"), `Route pattern captured — operation: ${controllerSpan === null || controllerSpan === void 0 ? void 0 : controllerSpan.operation}`);
        return TestUtil.shutdownScout(t, scout);
    })
        .then(() => mock.stop())
        .catch((err) => {
        mock.stop().catch(() => undefined);
        t.fail(err.message);
        t.end();
    });
});
test("Express error response is tagged on the request", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let scout;
    mock.start()
        .then(() => {
        scout = new scout_1.Scout(buildScoutWithMock(mock));
        return scout.setup();
    })
        .then(() => {
        const app = makeApp(scout, (mw) => TestUtil.simpleErrorApp(mw));
        const sentPromise = nextRequestSent(scout);
        request(app).get("/").end(() => undefined);
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
test("Mock agent receives Register message on connect", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let scout;
    mock.start()
        .then(() => {
        scout = new scout_1.Scout(buildScoutWithMock(mock, { name: "test-app", key: "test-key" }));
        return scout.setup();
    })
        .then(() => mock.waitForMessage("Register"))
        .then((msg) => {
        t.ok(msg, "Register message received by mock agent");
        t.equal(msg.type, "Register", "message type is Register");
    })
        .then(() => scout.shutdown())
        .then(() => mock.stop())
        .then(() => t.end())
        .catch((err) => {
        mock.stop().catch(() => undefined);
        if (scout) {
            scout.shutdown().catch(() => undefined);
        }
        t.fail(err.message);
        t.end();
    });
});
