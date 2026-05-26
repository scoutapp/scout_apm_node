"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const lib_1 = require("../../lib");
(0, lib_1.setupRequireIntegrations)(["ioredis"]);
const ioredis_1 = tslib_1.__importDefault(require("ioredis"));
const tape_1 = tslib_1.__importDefault(require("tape"));
const TestUtil = tslib_1.__importStar(require("../util"));
const integrations_1 = require("../../lib/types/integrations");
const types_1 = require("../../lib/types");
const scout_1 = require("../../lib/scout");
const mock_agent_1 = require("../integration/mock-agent");
const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);
const TIMEOUT_MS = 10000;
const sharedMock = new mock_agent_1.MockAgent();
(0, tape_1.default)("setup: start shared mock agent", (t) => {
    sharedMock.start().then(() => t.end()).catch(t.end);
});
(0, tape_1.default)("ioredis shim is applied", (t) => {
    t.ok(ioredis_1.default[(0, integrations_1.getIntegrationSymbol)()], "Redis class has integration symbol");
    t.end();
});
(0, tape_1.default)("Redis/SET span is created during a request", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));
    const client = new ioredis_1.default({ host: REDIS_HOST, port: REDIS_PORT, lazyConnect: true });
    const listener = (data) => {
        const spans = data.request.getChildSpansSync();
        const setSpan = spans.find((s) => s.operation === "Redis/SET");
        if (!setSpan) {
            return;
        }
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        t.ok(setSpan, "Redis/SET span present");
        t.ok(setSpan.getContextValue("db.statement"), "db.statement context set");
        client.quit()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout.setup()
        .then(() => client.connect())
        .then(() => scout.transaction("Controller/ioredis-set-test", (done) => {
        return client.set("scout_test_key", "scout_test_value")
            .then(() => done());
    }))
        .catch((err) => {
        client.quit().catch(() => undefined);
        TestUtil.shutdownScout(t, scout, err);
    });
});
(0, tape_1.default)("Redis/GET span is created during a request", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));
    const client = new ioredis_1.default({ host: REDIS_HOST, port: REDIS_PORT, lazyConnect: true });
    const listener = (data) => {
        const spans = data.request.getChildSpansSync();
        const getSpan = spans.find((s) => s.operation === "Redis/GET");
        if (!getSpan) {
            return;
        }
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        t.ok(getSpan, "Redis/GET span present");
        const stmt = getSpan.getContextValue("db.statement");
        t.ok(stmt && stmt.startsWith("GET "), `db.statement starts with GET, got: ${stmt}`);
        client.quit()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout.setup()
        .then(() => client.connect())
        .then(() => scout.transaction("Controller/ioredis-get-test", (done) => {
        return client.set("scout_test_key", "scout_test_value")
            .then(() => client.get("scout_test_key"))
            .then(() => done());
    }))
        .catch((err) => {
        client.quit().catch(() => undefined);
        TestUtil.shutdownScout(t, scout, err);
    });
});
(0, tape_1.default)("teardown: stop shared mock agent", (t) => {
    sharedMock.stop().then(() => t.end()).catch(t.end);
});
