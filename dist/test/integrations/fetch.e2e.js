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
const lib_1 = require("../../lib");
(0, lib_1.setupRequireIntegrations)(["fetch"]);
const http = __importStar(require("http"));
const tape_1 = __importDefault(require("tape"));
const TestUtil = __importStar(require("../util"));
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
(0, tape_1.default)("setup: start shared mock agent", (t) => {
    sharedMock.start().then(() => t.end()).catch(t.end);
});
(0, tape_1.default)("setup: start local HTTP target server", (t) => {
    testServer = http.createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
    });
    testServer.listen(0, "127.0.0.1", () => {
        testServerPort = testServer.address().port;
        t.end();
    });
});
if (NODE_MAJOR < 18) {
    (0, tape_1.default)("fetch integration is skipped on Node < 18", (t) => {
        t.pass(`Node ${process.version} < 18 — fetch instrumentation not active`);
        t.end();
    });
}
else {
    (0, tape_1.default)("HTTP/GET span is created for a fetch request", { timeout: TIMEOUT_MS }, (t) => {
        const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
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
    (0, tape_1.default)("HTTP/POST span is created for a fetch POST request", { timeout: TIMEOUT_MS }, (t) => {
        const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
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
    (0, tape_1.default)("HTTP/GET span has error context on network failure", { timeout: TIMEOUT_MS }, (t) => {
        const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
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
    (0, tape_1.default)("concurrent fetch requests each get their own span", { timeout: TIMEOUT_MS }, (t) => {
        const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
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
(0, tape_1.default)("teardown: stop local HTTP target server", (t) => {
    if (testServer) {
        testServer.close(() => t.end());
    }
    else {
        t.end();
    }
});
(0, tape_1.default)("teardown: stop shared mock agent", (t) => {
    sharedMock.stop().then(() => t.end()).catch(t.end);
});
