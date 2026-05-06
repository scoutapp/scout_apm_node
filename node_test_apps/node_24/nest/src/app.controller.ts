import { Controller, Get, Req, Res } from "@nestjs/common";
import * as http from "http";

const { getLastRequestMessages } = require("../store");

@Controller()
export class AppController {
    @Get("/api/hello")
    apiHello(@Res() res: any) {
        res.json({ message: "Hello from the internal API!", runtime: "node24", framework: "nestjs" });
    }

    @Get("/")
    async home(@Res() res: any) {
        // pg integration — SQL/Query span (only when PGHOST is configured)
        let dbResult = "(no database)";
        if (process.env.PGHOST) {
            try {
                const { Pool } = require("pg");
                const pool = new Pool({
                    host: process.env.PGHOST,
                    port: Number(process.env.PGPORT) || 5432,
                    user: process.env.PGUSER || "postgres",
                    password: process.env.PGPASSWORD || "postgres",
                    database: process.env.PGDATABASE || "scout_demo",
                });
                const r = await pool.query("SELECT version() AS db_version");
                dbResult = r.rows[0].db_version;
                pool.end().catch(() => undefined);
            } catch (err: any) {
                dbResult = `(db unavailable: ${err.message})`;
            }
        }

        // http integration — HTTP/Get span
        const apiResult: string = await new Promise((resolve) => {
            const opts = {
                hostname: "127.0.0.1",
                port: process.env.PORT || 3003,
                path: "/api/hello",
                method: "GET",
            };
            const r = http.request(opts, (resp) => {
                let body = "";
                resp.on("data", (c) => { body += c; });
                resp.on("end", () => resolve(body));
            });
            r.on("error", (e: any) => resolve(`(http error: ${e.message})`));
            r.end();
        });

        // mustache integration — Template/Render span (via view engine)
        res.render("home", { nodeVersion: process.version, dbResult, apiResult });
    }

    @Get("/diagnostics")
    async diagnostics(@Res() res: any) {
        const rows = await getLastRequestMessages();
        const messages = rows.map((r: any, i: number) => {
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
            nodeVersion: process.version,
            requestId,
            hasMessages: messages.length > 0,
            messages,
        });
    }
}
