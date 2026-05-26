import test from "tape";
import * as path from "path";
import request from "supertest";
import express, { Application, Request, Response } from "express";
import { get as getRootDir } from "app-root-dir";

import { MockAgent } from "./mock-agent";
import { scoutMiddleware, ApplicationWithScout } from "../../lib/express";
import { setupRequireIntegrations } from "../../lib";
import {
    ScoutEvent,
    ScoutSpanOperation,
    ScoutContextName,
    buildScoutConfiguration,
} from "../../lib/types";
import { Scout, ScoutSpan, ScoutEventRequestSentData } from "../../lib/scout";

// Must run before any instrumented library is first required so RITM can shim them.
setupRequireIntegrations(["mustache", "ejs", "pug", "pg"]);

const TIMEOUT = 10000;
const PAYLOAD_DIR = path.join(__dirname, "payloads");
// Fixture views live in source tree; use getRootDir() so the path is correct at runtime.
const VIEWS_DIR = path.join(getRootDir(), "test/fixtures/files");

type AppWithScout = Application & ApplicationWithScout;

function buildConfig(mock: MockAgent) {
    return buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: mock.socketPath(),
    });
}

function makeApp(mock: MockAgent, factory: (mw: any) => Application): AppWithScout {
    return factory(
        scoutMiddleware({
            config: buildConfig(mock),
            requestTimeoutMs: 0,
            waitForScoutSetup: true,
        }),
    ) as AppWithScout;
}

function nextRequestSent(scout: Scout, skipCount = 0): Promise<ScoutEventRequestSentData> {
    return new Promise((resolve, reject) => {
        let skipped = 0;
        const timer = setTimeout(() => {
            scout.removeListener(ScoutEvent.RequestSent, listener);
            reject(new Error("Timed out waiting for ScoutEvent.RequestSent"));
        }, TIMEOUT - 2000);

        const listener = (data: ScoutEventRequestSentData) => {
            if (skipped < skipCount) { skipped++; return; }
            clearTimeout(timer);
            scout.removeListener(ScoutEvent.RequestSent, listener);
            resolve(data);
        };

        scout.on(ScoutEvent.RequestSent, listener);
    });
}

/** Walk the full span tree and return the first span matching operation. */
function findSpan(spans: ScoutSpan[], op: string): ScoutSpan | undefined {
    for (const s of spans) {
        if (s.operation === op) { return s; }
        const found = findSpan(s.getChildSpansSync(), op);
        if (found) { return found; }
    }
    return undefined;
}

// ---------------------------------------------------------------------------
// Mustache
// ---------------------------------------------------------------------------

test("Mustache render creates a Template/Render span", { timeout: TIMEOUT }, (t) => {
    const mock = new MockAgent();
    let scout: Scout;

    mock.start()
        .then(() => {
            const app = makeApp(mock, (mw) => {
                const a = express();
                a.use(mw);
                a.get("/", (_req: Request, res: Response) => {
                    // require() here so the RITM shim is active at call time
                    const mustache = require("mustache");
                    res.send(mustache.render("Hello {{name}}!", { name: "Scout" }));
                });
                return a;
            });
            return request(app).get("/").expect(200).then(() => app);
        })
        .then((app) => {
            scout = (app as AppWithScout).scout!;
            const sent = nextRequestSent(scout, 1);
            request(app).get("/").end(() => undefined);
            return sent;
        })
        .then((data) => {
            const span = findSpan(data.request.getChildSpansSync(), ScoutSpanOperation.TemplateRender);

            t.ok(span, "Template/Render span present");
            t.equal(span && span.getContextValue(ScoutContextName.Name), "<string>",
                "name tag is '<string>'");

            mock.dumpToFile(path.join(PAYLOAD_DIR, "mustache.json"));
            return scout.shutdown();
        })
        .then(() => mock.stop())
        .then(() => t.end())
        .catch((err) => {
            mock.stop().catch(() => undefined);
            t.fail(err.message);
            t.end();
        });
});

// ---------------------------------------------------------------------------
// EJS
// ---------------------------------------------------------------------------

test("EJS render creates a Template/Render span", { timeout: TIMEOUT }, (t) => {
    const mock = new MockAgent();
    let scout: Scout;

    mock.start()
        .then(() => {
            const app = makeApp(mock, (mw) => {
                const a = express();
                a.use(mw);
                a.get("/", (_req: Request, res: Response) => {
                    const ejs = require("ejs");
                    res.send(ejs.render("<h1><%= title %></h1>", { title: "Scout" }));
                });
                return a;
            });
            return request(app).get("/").expect(200).then(() => app);
        })
        .then((app) => {
            scout = (app as AppWithScout).scout!;
            const sent = nextRequestSent(scout, 1);
            request(app).get("/").end(() => undefined);
            return sent;
        })
        .then((data) => {
            const span = findSpan(data.request.getChildSpansSync(), ScoutSpanOperation.TemplateRender);

            t.ok(span, "Template/Render span present");
            t.equal(span && span.getContextValue(ScoutContextName.Name), "<string>",
                "name tag is '<string>'");

            mock.dumpToFile(path.join(PAYLOAD_DIR, "ejs.json"));
            return scout.shutdown();
        })
        .then(() => mock.stop())
        .then(() => t.end())
        .catch((err) => {
            mock.stop().catch(() => undefined);
            t.fail(err.message);
            t.end();
        });
});

// ---------------------------------------------------------------------------
// Pug
// ---------------------------------------------------------------------------

test("Pug renderFile creates a Template/Render span with a file path", { timeout: TIMEOUT }, (t) => {
    const fixture = path.join(VIEWS_DIR, "html5-boilerplate.pug");
    const mock = new MockAgent();
    let scout: Scout;

    mock.start()
        .then(() => {
            const app = makeApp(mock, (mw) => {
                const a = express();
                a.use(mw);
                a.get("/", (_req: Request, res: Response) => {
                    const pug = require("pug");
                    res.send(pug.renderFile(fixture, { title: "Scout" }));
                });
                return a;
            });
            return request(app).get("/").expect(200).then(() => app);
        })
        .then((app) => {
            scout = (app as AppWithScout).scout!;
            const sent = nextRequestSent(scout, 1);
            request(app).get("/").end(() => undefined);
            return sent;
        })
        .then((data) => {
            const span = findSpan(data.request.getChildSpansSync(), ScoutSpanOperation.TemplateRender);

            t.ok(span, "Template/Render span present");
            const nameTag = span && span.getContextValue(ScoutContextName.Name);
            t.ok(
                typeof nameTag === "string" && nameTag.endsWith(".pug"),
                `name tag is a .pug path: ${nameTag}`,
            );

            mock.dumpToFile(path.join(PAYLOAD_DIR, "pug.json"));
            return scout.shutdown();
        })
        .then(() => mock.stop())
        .then(() => t.end())
        .catch((err) => {
            mock.stop().catch(() => undefined);
            t.fail(err.message);
            t.end();
        });
});

// ---------------------------------------------------------------------------
// PostgreSQL  (only runs when PGHOST is set — e.g. in CI with the DB service)
// ---------------------------------------------------------------------------

test("PG query creates a SQL/Query span with db.statement", { timeout: TIMEOUT }, (t) => {
    if (!process.env.PGHOST) {
        t.skip("PGHOST not set — skipping pg integration test");
        t.end();
        return;
    }

    const mock = new MockAgent();
    let scout: Scout;

    // Lazy-require pg AFTER setupRequireIntegrations so the shim is applied.
    const { Client } = require("pg");
    const client = new Client({
        host: process.env.PGHOST || "localhost",
        port: Number(process.env.PGPORT) || 5432,
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD || "postgres",
        database: process.env.PGDATABASE || "scout_test",
    });

    client.connect()
        .then(() => mock.start())
        .then(() => {
            const app = makeApp(mock, (mw) => {
                const a = express();
                a.use(mw);
                a.get("/", (_req: Request, res: Response) => {
                    client.query("SELECT 1 AS result")
                        .then(() => res.send({ status: "ok" }))
                        .catch((err: Error) => res.status(500).send({ error: err.message }));
                });
                return a;
            });
            return request(app).get("/").expect(200).then(() => app);
        })
        .then((app) => {
            scout = (app as AppWithScout).scout!;
            const sent = nextRequestSent(scout, 1);
            request(app).get("/").end(() => undefined);
            return sent;
        })
        .then((data) => {
            const span = findSpan(data.request.getChildSpansSync(), ScoutSpanOperation.SQLQuery);

            t.ok(span, "SQL/Query span present");
            t.equal(
                span && span.getContextValue(ScoutContextName.DBStatement),
                "SELECT 1 AS result",
                "db.statement tag captured",
            );

            mock.dumpToFile(path.join(PAYLOAD_DIR, "pg.json"));
            return scout.shutdown();
        })
        .then(() => client.end())
        .then(() => mock.stop())
        .then(() => t.end())
        .catch((err) => {
            client.end().catch(() => undefined);
            mock.stop().catch(() => undefined);
            t.fail(err.message);
            t.end();
        });
});
