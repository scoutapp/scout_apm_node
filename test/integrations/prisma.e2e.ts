import { setupRequireIntegrations } from "../../lib";
setupRequireIntegrations(["@prisma/client"]);

import { PrismaClient } from "@prisma/client";
import * as test from "tape";
import * as TestUtil from "../util";
import { ScoutEvent, buildScoutConfiguration } from "../../lib/types";
import { Scout, ScoutEventRequestSentData } from "../../lib/scout";
import { ScoutContextName, ScoutSpanOperation } from "../../lib/types";
import { MockAgent } from "../integration/mock-agent";

// Uses an already-running postgres (e.g. docker-compose) instead of spinning up a
// new container, since the test environment may not have enough memory for two instances.
const PG_HOST = process.env.PGHOST || "localhost";
const PG_PORT = parseInt(process.env.PGPORT || "5433", 10);
const PG_USER = process.env.PGUSER || "postgres";
const PG_PASS = process.env.PGPASSWORD || "postgres";
const PG_DB   = process.env.PGDATABASE || "postgres";
const DATABASE_URL = process.env.DATABASE_URL ||
    `postgresql://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/${PG_DB}`;

const TIMEOUT_MS = 30000;

const sharedMock = new MockAgent();

function makePrisma(url: string = DATABASE_URL): PrismaClient {
    return new PrismaClient({ datasources: { db: { url } } } as any);
}

test("setup: start shared mock agent", (t) => {
    sharedMock.start().then(() => t.end()).catch(t.end);
});

test("setup: create TestRecord table", { timeout: TIMEOUT_MS }, (t) => {
    const prisma = makePrisma();
    prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "TestRecord" (id SERIAL PRIMARY KEY, value TEXT NOT NULL)`,
    )
        .then(() => prisma.$disconnect())
        .then(() => t.end())
        .catch((err: Error) => { prisma.$disconnect().catch(() => undefined); t.end(err); });
});

test("the shim replaces PrismaClient", (t) => {
    t.notEqual(
        (PrismaClient as any).name,
        "PrismaClient",
        "PrismaClient constructor is patched (name differs from original)",
    );
    t.end();
});

test("SQL/Query span is created for a Prisma createMany operation", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    const prisma = makePrisma();

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const dbSpan = spans.find((s) => s.operation === ScoutSpanOperation.SQLQuery);
        if (!dbSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);

        t.ok(dbSpan, "SQL/Query span is present");
        const stmt = dbSpan.getContextValue(ScoutContextName.DBStatement) as string;
        t.ok(stmt && stmt.startsWith("TestRecord."), `db.statement starts with model name: ${stmt}`);
        t.equal(stmt, "TestRecord.createMany", "db.statement is TestRecord.createMany");

        prisma.$disconnect()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err: Error) => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => scout.transaction("Controller/prisma-create-test", (done) => {
            return (prisma as any).testRecord.createMany({
                data: [{ value: "scout-test-a" }, { value: "scout-test-b" }],
            }).then(() => done());
        }))
        .catch((err: Error) => {
            prisma.$disconnect().catch(() => undefined);
            TestUtil.shutdownScout(t, scout, err);
        });
});

test("SQL/Query span is created for a Prisma findMany operation", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    const prisma = makePrisma();

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const dbSpan = spans.find((s) => s.operation === ScoutSpanOperation.SQLQuery);
        if (!dbSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);

        t.ok(dbSpan, "SQL/Query span is present");
        const stmt = dbSpan.getContextValue(ScoutContextName.DBStatement) as string;
        t.equal(stmt, "TestRecord.findMany", "db.statement is TestRecord.findMany");

        prisma.$disconnect()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err: Error) => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => scout.transaction("Controller/prisma-findmany-test", (done) => {
            return (prisma as any).testRecord.findMany().then(() => done());
        }))
        .catch((err: Error) => {
            prisma.$disconnect().catch(() => undefined);
            TestUtil.shutdownScout(t, scout, err);
        });
});

test("SQL/Query span has error context when operation fails", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    // Bad URL to force a connection error
    const badPrisma = makePrisma("postgresql://bad:bad@localhost:1/nodb");

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const dbSpan = spans.find((s) => s.operation === ScoutSpanOperation.SQLQuery);
        if (!dbSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);

        t.ok(dbSpan, "SQL/Query span is present on error");
        t.equal(
            dbSpan.getContextValue(ScoutContextName.Error),
            "true",
            "error context is set to 'true'",
        );

        badPrisma.$disconnect().catch(() => undefined);
        TestUtil.shutdownScout(t, scout);
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => scout.transaction("Controller/prisma-error-test", (done) => {
            return (badPrisma as any).testRecord.findMany()
                .catch(() => { /* expected */ })
                .then(() => done());
        }))
        .catch((err: Error) => {
            badPrisma.$disconnect().catch(() => undefined);
            TestUtil.shutdownScout(t, scout, err);
        });
});

test("no span is created when there is no active Scout instance", { timeout: TIMEOUT_MS }, (t) => {
    // PrismaClient used outside any Scout transaction — operation should pass through
    const prisma = makePrisma();

    (prisma as any).testRecord.findMany()
        .then((rows: any[]) => {
            t.ok(Array.isArray(rows), "findMany returned an array without scout");
            return prisma.$disconnect();
        })
        .then(() => t.end())
        .catch((err: Error) => {
            prisma.$disconnect().catch(() => undefined);
            t.end(err);
        });
});

test("teardown: stop shared mock agent", (t) => {
    sharedMock.stop().then(() => t.end()).catch(t.end);
});
