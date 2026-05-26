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
(0, lib_1.setupRequireIntegrations)(["@prisma/client"]);
const client_1 = require("@prisma/client");
const tape_1 = __importDefault(require("tape"));
const TestUtil = __importStar(require("../util"));
const types_1 = require("../../lib/types");
const scout_1 = require("../../lib/scout");
const types_2 = require("../../lib/types");
const mock_agent_1 = require("../integration/mock-agent");
// Uses an already-running postgres (e.g. docker-compose) instead of spinning up a
// new container, since the test environment may not have enough memory for two instances.
const PG_HOST = process.env.PGHOST || "localhost";
const PG_PORT = parseInt(process.env.PGPORT || "5433", 10);
const PG_USER = process.env.PGUSER || "postgres";
const PG_PASS = process.env.PGPASSWORD || "postgres";
const PG_DB = process.env.PGDATABASE || "postgres";
const DATABASE_URL = process.env.DATABASE_URL ||
    `postgresql://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/${PG_DB}`;
const TIMEOUT_MS = 30000;
const sharedMock = new mock_agent_1.MockAgent();
function makePrisma(url = DATABASE_URL) {
    return new client_1.PrismaClient({ datasources: { db: { url } } });
}
(0, tape_1.default)("setup: start shared mock agent", (t) => {
    sharedMock.start().then(() => t.end()).catch(t.end);
});
(0, tape_1.default)("setup: create TestRecord table", { timeout: TIMEOUT_MS }, (t) => {
    const prisma = makePrisma();
    prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TestRecord" (id SERIAL PRIMARY KEY, value TEXT NOT NULL)`)
        .then(() => prisma.$disconnect())
        .then(() => t.end())
        .catch((err) => { prisma.$disconnect().catch(() => undefined); t.end(err); });
});
(0, tape_1.default)("the shim replaces PrismaClient", (t) => {
    t.notEqual(client_1.PrismaClient.name, "PrismaClient", "PrismaClient constructor is patched (name differs from original)");
    t.end();
});
(0, tape_1.default)("SQL/Query span is created for a Prisma createMany operation", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));
    const prisma = makePrisma();
    const listener = (data) => {
        const spans = data.request.getChildSpansSync();
        const dbSpan = spans.find((s) => s.operation === types_2.ScoutSpanOperation.SQLQuery);
        if (!dbSpan) {
            return;
        }
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        t.ok(dbSpan, "SQL/Query span is present");
        const stmt = dbSpan.getContextValue(types_2.ScoutContextName.DBStatement);
        t.ok(stmt && stmt.startsWith("TestRecord."), `db.statement starts with model name: ${stmt}`);
        t.equal(stmt, "TestRecord.createMany", "db.statement is TestRecord.createMany");
        prisma.$disconnect()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout.setup()
        .then(() => scout.transaction("Controller/prisma-create-test", (done) => {
        return prisma.testRecord.createMany({
            data: [{ value: "scout-test-a" }, { value: "scout-test-b" }],
        }).then(() => done());
    }))
        .catch((err) => {
        prisma.$disconnect().catch(() => undefined);
        TestUtil.shutdownScout(t, scout, err);
    });
});
(0, tape_1.default)("SQL/Query span is created for a Prisma findMany operation", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));
    const prisma = makePrisma();
    const listener = (data) => {
        const spans = data.request.getChildSpansSync();
        const dbSpan = spans.find((s) => s.operation === types_2.ScoutSpanOperation.SQLQuery);
        if (!dbSpan) {
            return;
        }
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        t.ok(dbSpan, "SQL/Query span is present");
        const stmt = dbSpan.getContextValue(types_2.ScoutContextName.DBStatement);
        t.equal(stmt, "TestRecord.findMany", "db.statement is TestRecord.findMany");
        prisma.$disconnect()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout.setup()
        .then(() => scout.transaction("Controller/prisma-findmany-test", (done) => {
        return prisma.testRecord.findMany().then(() => done());
    }))
        .catch((err) => {
        prisma.$disconnect().catch(() => undefined);
        TestUtil.shutdownScout(t, scout, err);
    });
});
(0, tape_1.default)("SQL/Query span has error context when operation fails", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));
    // Bad URL to force a connection error
    const badPrisma = makePrisma("postgresql://bad:bad@localhost:1/nodb");
    const listener = (data) => {
        const spans = data.request.getChildSpansSync();
        const dbSpan = spans.find((s) => s.operation === types_2.ScoutSpanOperation.SQLQuery);
        if (!dbSpan) {
            return;
        }
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        t.ok(dbSpan, "SQL/Query span is present on error");
        t.equal(dbSpan.getContextValue(types_2.ScoutContextName.Error), "true", "error context is set to 'true'");
        badPrisma.$disconnect().catch(() => undefined);
        TestUtil.shutdownScout(t, scout);
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout.setup()
        .then(() => scout.transaction("Controller/prisma-error-test", (done) => {
        return badPrisma.testRecord.findMany()
            .catch(() => { })
            .then(() => done());
    }))
        .catch((err) => {
        badPrisma.$disconnect().catch(() => undefined);
        TestUtil.shutdownScout(t, scout, err);
    });
});
(0, tape_1.default)("no span is created when there is no active Scout instance", { timeout: TIMEOUT_MS }, (t) => {
    // PrismaClient used outside any Scout transaction — operation should pass through
    const prisma = makePrisma();
    prisma.testRecord.findMany()
        .then((rows) => {
        t.ok(Array.isArray(rows), "findMany returned an array without scout");
        return prisma.$disconnect();
    })
        .then(() => t.end())
        .catch((err) => {
        prisma.$disconnect().catch(() => undefined);
        t.end(err);
    });
});
(0, tape_1.default)("teardown: stop shared mock agent", (t) => {
    sharedMock.stop().then(() => t.end()).catch(t.end);
});
