"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const path = require("path");
const request = require("supertest");
const express = require("express");
const app_root_dir_1 = require("app-root-dir");
const mock_agent_1 = require("./mock-agent");
const express_1 = require("../../lib/express");
const lib_1 = require("../../lib");
const types_1 = require("../../lib/types");
const scout_1 = require("../../lib/scout");
// Must run before any instrumented library is first required so RITM can shim them.
(0, lib_1.setupRequireIntegrations)(["mustache", "ejs", "pug", "pg"]);
const TIMEOUT = 15000;
const PAYLOAD_DIR = path.join(__dirname, "payloads");
// Fixture views live in source tree; use getRootDir() so the path is correct at runtime.
const VIEWS_DIR = path.join((0, app_root_dir_1.get)(), "test/fixtures/files");
function buildConfig(mock) {
    return (0, types_1.buildScoutConfiguration)({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: mock.socketPath(),
    });
}
function makeApp(scout, factory) {
    return factory((0, express_1.scoutMiddleware)({
        scout,
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }));
}
function nextRequestSent(scout) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
            reject(new Error("Timed out waiting for ScoutEvent.RequestSent"));
        }, TIMEOUT - 2000);
        const listener = (data) => {
            // Ignore HTTP integration transactions (no Controller/ span) — they fire
            // for supertest's outbound http.request() calls.
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
/** Walk the full span tree and return the first span matching operation. */
function findSpan(spans, op) {
    for (const s of spans) {
        if (s.operation === op) {
            return s;
        }
        const found = findSpan(s.getChildSpansSync(), op);
        if (found) {
            return found;
        }
    }
    return undefined;
}
// ---------------------------------------------------------------------------
// Mustache
// ---------------------------------------------------------------------------
test("Mustache render creates a Template/Render span", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let scout;
    mock.start()
        .then(() => {
        scout = new scout_1.Scout(buildConfig(mock));
        return scout.setup();
    })
        .then(() => {
        const app = makeApp(scout, (mw) => {
            const a = express();
            a.use(mw);
            a.get("/", (req, res) => {
                // require() here so the RITM shim is active at call time
                const mustache = require("mustache");
                res.send(mustache.render("Hello {{name}}!", { name: "Scout" }));
            });
            return a;
        });
        const sent = nextRequestSent(scout);
        request(app).get("/").end(() => undefined);
        return sent;
    })
        .then((data) => {
        const span = findSpan(data.request.getChildSpansSync(), types_1.ScoutSpanOperation.TemplateRender);
        t.ok(span, "Template/Render span present");
        t.equal(span && span.getContextValue(types_1.ScoutContextName.Name), "<string>", "name tag is '<string>'");
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
    const mock = new mock_agent_1.MockAgent();
    let scout;
    mock.start()
        .then(() => {
        scout = new scout_1.Scout(buildConfig(mock));
        return scout.setup();
    })
        .then(() => {
        const app = makeApp(scout, (mw) => {
            const a = express();
            a.use(mw);
            a.get("/", (req, res) => {
                const ejs = require("ejs");
                res.send(ejs.render("<h1><%= title %></h1>", { title: "Scout" }));
            });
            return a;
        });
        const sent = nextRequestSent(scout);
        request(app).get("/").end(() => undefined);
        return sent;
    })
        .then((data) => {
        const span = findSpan(data.request.getChildSpansSync(), types_1.ScoutSpanOperation.TemplateRender);
        t.ok(span, "Template/Render span present");
        t.equal(span && span.getContextValue(types_1.ScoutContextName.Name), "<string>", "name tag is '<string>'");
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
    const mock = new mock_agent_1.MockAgent();
    let scout;
    mock.start()
        .then(() => {
        scout = new scout_1.Scout(buildConfig(mock));
        return scout.setup();
    })
        .then(() => {
        const app = makeApp(scout, (mw) => {
            const a = express();
            a.use(mw);
            a.get("/", (req, res) => {
                const pug = require("pug");
                res.send(pug.renderFile(fixture, { title: "Scout" }));
            });
            return a;
        });
        const sent = nextRequestSent(scout);
        request(app).get("/").end(() => undefined);
        return sent;
    })
        .then((data) => {
        const span = findSpan(data.request.getChildSpansSync(), types_1.ScoutSpanOperation.TemplateRender);
        t.ok(span, "Template/Render span present");
        const nameTag = span && span.getContextValue(types_1.ScoutContextName.Name);
        t.ok(typeof nameTag === "string" && nameTag.endsWith(".pug"), `name tag is a .pug path: ${nameTag}`);
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
    const mock = new mock_agent_1.MockAgent();
    let scout;
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
        scout = new scout_1.Scout(buildConfig(mock));
        return scout.setup();
    })
        .then(() => {
        const app = makeApp(scout, (mw) => {
            const a = express();
            a.use(mw);
            a.get("/", (req, res) => {
                client.query("SELECT 1 AS result")
                    .then(() => res.send({ status: "ok" }))
                    .catch((err) => res.status(500).send({ error: err.message }));
            });
            return a;
        });
        const sent = nextRequestSent(scout);
        request(app).get("/").end(() => undefined);
        return sent;
    })
        .then((data) => {
        const span = findSpan(data.request.getChildSpansSync(), types_1.ScoutSpanOperation.SQLQuery);
        t.ok(span, "SQL/Query span present");
        t.equal(span && span.getContextValue(types_1.ScoutContextName.DBStatement), "SELECT 1 AS result", "db.statement tag captured");
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
