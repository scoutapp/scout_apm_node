"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("../../lib");
lib_1.setupRequireIntegrations(["fetch"]);
const http = require("http");
const test = require("tape");
const TestUtil = require("../util");
const types_1 = require("../../lib/types");
const scout_1 = require("../../lib/scout");
const types_2 = require("../../lib/types");
const mock_agent_1 = require("../integration/mock-agent");
const TIMEOUT_MS = 10000;
const NODE_MAJOR = parseInt(process.versions.node.split(".")[0], 10);
const sharedMock = new mock_agent_1.MockAgent();
// Spin up a minimal HTTP server once for all tests that need a target to fetch.
let testServer;
let testServerPort;
test("setup: start shared mock agent", (t) => {
    sharedMock.start().then(() => t.end()).catch(t.end);
});
test("setup: start local HTTP target server", (t) => {
    testServer = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
    });
    testServer.listen(0, "127.0.0.1", () => {
        testServerPort = testServer.address().port;
        t.end();
    });
});
if (NODE_MAJOR < 18) {
    test("fetch integration is skipped on Node < 18", (t) => {
        t.pass(`Node ${process.version} < 18 — fetch instrumentation not active`);
        t.end();
    });
}
else {
    test("HTTP/GET span is created for a fetch request", { timeout: TIMEOUT_MS }, (t) => {
        const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
            allowShutdown: true,
            monitor: true,
            coreAgentDownload: false,
            coreAgentLaunch: false,
            socketPath: sharedMock.socketPath(),
        }));
        const listener = (data) => {
            const spans = data.request.getChildSpansSync();
            const fetchSpan = spans.find((s) => s.operation === "HTTP/GET");
            if (!fetchSpan) {
                return;
            }
            scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
            t.ok(fetchSpan, "HTTP/GET span is present");
            const url = fetchSpan.getContextValue(types_2.ScoutContextName.URL);
            t.ok(url && url.includes("127.0.0.1"), `url context is set: ${url}`);
            TestUtil.shutdownScout(t, scout);
        };
        scout.on(types_1.ScoutEvent.RequestSent, listener);
        scout.setup()
            .then(() => scout.transaction("Controller/fetch-get-test", (done) => {
            return fetch(`http://127.0.0.1:${testServerPort}/hello`)
                .then(() => done());
        }))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    });
    test("HTTP/POST span is created for a fetch POST request", { timeout: TIMEOUT_MS }, (t) => {
        const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
            allowShutdown: true,
            monitor: true,
            coreAgentDownload: false,
            coreAgentLaunch: false,
            socketPath: sharedMock.socketPath(),
        }));
        const listener = (data) => {
            const spans = data.request.getChildSpansSync();
            const fetchSpan = spans.find((s) => s.operation === "HTTP/POST");
            if (!fetchSpan) {
                return;
            }
            scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
            t.ok(fetchSpan, "HTTP/POST span is present");
            TestUtil.shutdownScout(t, scout);
        };
        scout.on(types_1.ScoutEvent.RequestSent, listener);
        scout.setup()
            .then(() => scout.transaction("Controller/fetch-post-test", (done) => {
            return fetch(`http://127.0.0.1:${testServerPort}/submit`, {
                method: "POST",
                body: "data=test",
            })
                .then(() => done());
        }))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    });
    test("HTTP/GET span has error context on network failure", { timeout: TIMEOUT_MS }, (t) => {
        const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
            allowShutdown: true,
            monitor: true,
            coreAgentDownload: false,
            coreAgentLaunch: false,
            socketPath: sharedMock.socketPath(),
        }));
        const listener = (data) => {
            const spans = data.request.getChildSpansSync();
            const fetchSpan = spans.find((s) => s.operation === "HTTP/GET");
            if (!fetchSpan) {
                return;
            }
            scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
            t.ok(fetchSpan, "HTTP/GET span is present on error");
            t.equal(fetchSpan.getContextValue(types_2.ScoutContextName.Error), "true", "error context is set to 'true'");
            TestUtil.shutdownScout(t, scout);
        };
        scout.on(types_1.ScoutEvent.RequestSent, listener);
        scout.setup()
            .then(() => scout.transaction("Controller/fetch-error-test", (done) => {
            // Port 1 is privileged and never listening — guaranteed ECONNREFUSED.
            return fetch("http://127.0.0.1:1/")
                .catch(() => { })
                .then(() => done());
        }))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    });
    test("concurrent fetch requests each get their own span", { timeout: TIMEOUT_MS }, (t) => {
        const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
            allowShutdown: true,
            monitor: true,
            coreAgentDownload: false,
            coreAgentLaunch: false,
            socketPath: sharedMock.socketPath(),
        }));
        const listener = (data) => {
            const spans = data.request.getChildSpansSync();
            const fetchSpans = spans.filter((s) => s.operation === "HTTP/GET");
            if (fetchSpans.length < 3) {
                return;
            }
            scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
            t.equal(fetchSpans.length, 3, "three concurrent HTTP/GET spans captured");
            fetchSpans.forEach((s, i) => {
                const url = s.getContextValue(types_2.ScoutContextName.URL);
                t.ok(url && url.includes("127.0.0.1"), `span ${i} has url context: ${url}`);
            });
            TestUtil.shutdownScout(t, scout);
        };
        scout.on(types_1.ScoutEvent.RequestSent, listener);
        scout.setup()
            .then(() => scout.transaction("Controller/fetch-concurrent-test", (done) => {
            return Promise.all([
                fetch(`http://127.0.0.1:${testServerPort}/a`),
                fetch(`http://127.0.0.1:${testServerPort}/b`),
                fetch(`http://127.0.0.1:${testServerPort}/c`),
            ]).then(() => done());
        }))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    });
}
test("teardown: stop local HTTP target server", (t) => {
    if (testServer) {
        testServer.close(() => t.end());
    }
    else {
        t.end();
    }
});
test("teardown: stop shared mock agent", (t) => {
    sharedMock.stop().then(() => t.end()).catch(t.end);
});
