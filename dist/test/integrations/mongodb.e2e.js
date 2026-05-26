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
(0, lib_1.setupRequireIntegrations)(["mongodb"]);
const mongodb_1 = require("mongodb");
const tape_1 = __importDefault(require("tape"));
const TestUtil = __importStar(require("../util"));
const integrations_1 = require("../../lib/types/integrations");
const types_1 = require("../../lib/types");
const scout_1 = require("../../lib/scout");
const mock_agent_1 = require("../integration/mock-agent");
const MONGO_HOST = process.env.MONGO_HOST || "127.0.0.1";
const MONGO_PORT = parseInt(process.env.MONGO_PORT || "27017", 10);
const MONGO_URI = `mongodb://${MONGO_HOST}:${MONGO_PORT}`;
const TIMEOUT_MS = 15000;
const sharedMock = new mock_agent_1.MockAgent();
(0, tape_1.default)("setup: start shared mock agent", (t) => {
    sharedMock.start().then(() => t.end()).catch(t.end);
});
(0, tape_1.default)("mongodb shim is applied", (t) => {
    const mongoModule = require("mongodb");
    t.ok(mongoModule[(0, integrations_1.getIntegrationSymbol)()], "mongodb module has integration symbol");
    t.end();
});
(0, tape_1.default)("MongoDB/insertOne span is created during a request", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));
    const client = new mongodb_1.MongoClient(MONGO_URI);
    const listener = (data) => {
        const spans = data.request.getChildSpansSync();
        const insertSpan = spans.find((s) => s.operation.startsWith("MongoDB/") && s.operation.endsWith("/insert"));
        if (!insertSpan) {
            return;
        }
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        t.ok(insertSpan, `insert span present: ${insertSpan.operation}`);
        const stmt = insertSpan.getContextValue("db.statement");
        t.ok(stmt && stmt.includes('"insert"'), `db.statement contains insert key, got: ${stmt}`);
        t.ok(stmt && stmt.includes('"?"'), `db.statement scrubs values with "?", got: ${stmt}`);
        client.close()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout.setup()
        .then(() => client.connect())
        .then(() => scout.transaction("Controller/mongodb-insert-test", (done) => {
        const collection = client.db("scout_test").collection("scout_e2e");
        return collection.insertOne({ name: "test", value: 42 })
            .then(() => done());
    }))
        .catch((err) => {
        client.close().catch(() => undefined);
        TestUtil.shutdownScout(t, scout, err);
    });
});
(0, tape_1.default)("MongoDB/find span is created during a request", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));
    const client = new mongodb_1.MongoClient(MONGO_URI);
    const listener = (data) => {
        const spans = data.request.getChildSpansSync();
        const findSpan = spans.find((s) => s.operation.startsWith("MongoDB/") && s.operation.endsWith("/find"));
        if (!findSpan) {
            return;
        }
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        t.ok(findSpan, `find span present: ${findSpan.operation}`);
        const stmt = findSpan.getContextValue("db.statement");
        t.ok(stmt && stmt.includes('"find"'), `db.statement contains find key, got: ${stmt}`);
        client.close()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout.setup()
        .then(() => client.connect())
        .then(() => scout.transaction("Controller/mongodb-find-test", (done) => {
        const collection = client.db("scout_test").collection("scout_e2e");
        return collection.find({ name: "test" }).toArray()
            .then(() => done());
    }))
        .catch((err) => {
        client.close().catch(() => undefined);
        TestUtil.shutdownScout(t, scout, err);
    });
});
(0, tape_1.default)("MongoDB span has error context on command failure", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));
    // Connect to a port not listening to force connection failure
    const badClient = new mongodb_1.MongoClient(`mongodb://${MONGO_HOST}:1`, {
        serverSelectionTimeoutMS: 2000,
        connectTimeoutMS: 2000,
    });
    scout.setup()
        .then(() => badClient.connect())
        .then(() => badClient.db("scout_test").collection("scout_e2e").insertOne({ x: 1 }))
        .then(() => {
        badClient.close().catch(() => undefined);
        TestUtil.shutdownScout(t, scout, new Error("Expected connection to fail"));
    })
        .catch((err) => {
        t.ok(err, `Got expected connection error: ${err.message}`);
        badClient.close().catch(() => undefined);
        TestUtil.shutdownScout(t, scout);
    });
});
(0, tape_1.default)("teardown: stop shared mock agent", (t) => {
    sharedMock.stop().then(() => t.end()).catch(t.end);
});
