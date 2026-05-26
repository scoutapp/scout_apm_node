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
(0, lib_1.setupRequireIntegrations)(["redis"]);
const redis_1 = require("redis");
const tape_1 = __importDefault(require("tape"));
const TestUtil = __importStar(require("../util"));
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
(0, tape_1.default)("redis shim is applied", (t) => {
    const redisModule = require("redis");
    t.ok(redisModule[(0, integrations_1.getIntegrationSymbol)()], "redis module has integration symbol");
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
    const client = (0, redis_1.createClient)({
        socket: { host: REDIS_HOST, port: REDIS_PORT },
    });
    const listener = (data) => {
        const spans = data.request.getChildSpansSync();
        const setSpan = spans.find((s) => s.operation === "Redis/SET");
        if (!setSpan) {
            return;
        }
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        t.ok(setSpan, "Redis/SET span present");
        const stmt = setSpan.getContextValue("db.statement");
        t.ok(stmt && stmt.startsWith("SET "), `db.statement starts with SET, got: ${stmt}`);
        client.disconnect()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout.setup()
        .then(() => client.connect())
        .then(() => scout.transaction("Controller/redis-set-test", (done) => {
        return client.set("scout_test_key", "scout_test_value")
            .then(() => done());
    }))
        .catch((err) => {
        client.disconnect().catch(() => undefined);
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
    const client = (0, redis_1.createClient)({
        socket: { host: REDIS_HOST, port: REDIS_PORT },
    });
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
        client.disconnect()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout.setup()
        .then(() => client.connect())
        .then(() => scout.transaction("Controller/redis-get-test", (done) => {
        return client.set("scout_test_key", "scout_test_value")
            .then(() => client.get("scout_test_key"))
            .then(() => done());
    }))
        .catch((err) => {
        client.disconnect().catch(() => undefined);
        TestUtil.shutdownScout(t, scout, err);
    });
});
(0, tape_1.default)("Redis/DEL span has error context on command failure", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));
    // Connect to a port that is not listening to force a connection error
    const client = (0, redis_1.createClient)({
        socket: { host: REDIS_HOST, port: 1 },
    });
    scout.setup()
        .then(() => client.connect())
        .then(() => {
        // connect() should have thrown, but just in case clean up
        client.disconnect().catch(() => undefined);
        TestUtil.shutdownScout(t, scout, new Error("Expected connection to fail"));
    })
        .catch((err) => {
        t.ok(err, `Got expected connection error: ${err.message}`);
        TestUtil.shutdownScout(t, scout);
    });
});
(0, tape_1.default)("teardown: stop shared mock agent", (t) => {
    sharedMock.stop().then(() => t.end()).catch(t.end);
});
