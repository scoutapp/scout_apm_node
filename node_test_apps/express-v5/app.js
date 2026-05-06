/**
 * Scout APM demo app — Express v5
 *
 * Home page uses pg, http, and mustache integrations so Scout generates rich
 * trace data.  A capture-agent (in-process TCP server) intercepts the Scout
 * wire protocol and stores messages in Postgres.  /diagnostics reads those
 * stored messages and renders them so you can see exactly what Scout would
 * have sent to the real core-agent.
 */
const { setupRequireIntegrations } = require("@scout_apm/scout-apm");

// Must run before any instrumented library is first required
setupRequireIntegrations(["mustache", "pg", "http"]);

const express     = require("express");
const http        = require("http");
const mustache    = require("mustache");
const mustacheExp = require("mustache-express");
const { expressMiddleware: scoutMiddleware, buildScoutConfiguration } = require("@scout_apm/scout-apm");
const { CaptureAgent } = require("./capture-agent");
const { initDb, getLastRequestMessages } = require("./store");

const app = express();

// Mustache view engine
app.engine("mustache", mustacheExp());
app.set("view engine", "mustache");
app.set("views", __dirname + "/views");

// ── Boot sequence ────────────────────────────────────────────────────────────
const captureAgent = new CaptureAgent();

captureAgent.start()
    .then(() => initDb())
    .then(() => {
        const config = buildScoutConfiguration({
            name: process.env.SCOUT_NAME || "scout-express-v5-demo",
            key: process.env.SCOUT_KEY || "demo-key",
            monitor: true,
            coreAgentDownload: false,
            coreAgentLaunch: false,
            allowShutdown: true,
            socketPath: captureAgent.socketPath(),
        });

        app.use(scoutMiddleware({ config, requestTimeoutMs: 0 }));

        // ── Routes ───────────────────────────────────────────────────────────

        // Internal API endpoint — exercised by the home page via http.get()
        app.get("/api/hello", (_req, res) => {
            res.json({ message: "Hello from the internal API!", framework: "express", version: 5 });
        });

        app.get("/", async (req, res) => {
            // 1. pg integration — SQL/Query span
            let dbResult = "(no database)";
            try {
                const { Pool } = require("pg");
                const pool = new Pool({
                    host: process.env.PGHOST || "postgres",
                    port: Number(process.env.PGPORT) || 5432,
                    user: process.env.PGUSER || "postgres",
                    password: process.env.PGPASSWORD || "postgres",
                    database: process.env.PGDATABASE || "scout_demo",
                });
                const r = await pool.query("SELECT version() AS db_version");
                dbResult = r.rows[0].db_version;
                pool.end().catch(() => undefined);
            } catch (err) {
                dbResult = `(db unavailable: ${err.message})`;
            }

            // 2. http integration — HTTP/Get span
            const apiResult = await new Promise((resolve) => {
                const opts = {
                    hostname: "127.0.0.1",
                    port: process.env.PORT || 3001,
                    path: "/api/hello",
                    method: "GET",
                };
                const r = http.request(opts, (resp) => {
                    let body = "";
                    resp.on("data", (c) => { body += c; });
                    resp.on("end", () => resolve(body));
                });
                r.on("error", (e) => resolve(`(http error: ${e.message})`));
                r.end();
            });

            // 3. mustache integration — Template/Render span (via view engine)
            res.render("home", {
                version: 5,
                dbResult,
                apiResult,
            });
        });

        app.get("/diagnostics", async (_req, res) => {
            const rows = await getLastRequestMessages();
            const messages = rows.map((r, i) => {
                const body = r.raw && typeof r.raw === "object" ? r.raw : {};
                const inner = body[r.type] || {};
                return {
                    index: i + 1,
                    type: r.type,
                    operation: inner.operation || "",
                    captured_at: r.captured_at,
                    payload: JSON.stringify(r.raw, null, 2),
                };
            });
            const requestId = rows.length > 0 ? (rows[0].request_id || "—") : "—";
            res.render("diagnostics", {
                requestId,
                hasMessages: messages.length > 0,
                messages,
            });
        });

        const PORT = process.env.PORT || 3001;
        const server = app.listen(PORT, () => {
            console.log(`Express v5 demo app listening on port ${PORT}`);
        });

        module.exports = { app, server };
    })
    .catch((err) => {
        console.error("Failed to start capture agent:", err);
        process.exit(1);
    });
