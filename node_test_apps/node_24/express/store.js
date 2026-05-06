/**
 * Message store: persists Scout protocol messages to Postgres.
 * Falls back to an in-memory ring buffer when Postgres is unavailable.
 */
let pg;
try { pg = require("pg"); } catch { /* no pg — use in-memory fallback */ }

const IN_MEMORY_LIMIT = 500;
let inMemory = [];
let pool = null;

async function initDb() {
    if (!pg || !process.env.PGHOST) return;
    try {
        pool = new pg.Pool({
            host: process.env.PGHOST || "localhost",
            port: Number(process.env.PGPORT) || 5432,
            user: process.env.PGUSER || "postgres",
            password: process.env.PGPASSWORD || "postgres",
            database: process.env.PGDATABASE || "scout_demo",
        });
        await pool.query(`
            CREATE TABLE IF NOT EXISTS scout_messages (
                id          SERIAL PRIMARY KEY,
                type        TEXT NOT NULL,
                request_id  TEXT,
                raw         JSONB NOT NULL,
                captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        console.log("[store] postgres ready");
    } catch (err) {
        console.warn("[store] postgres unavailable, using in-memory fallback:", err.message);
        pool = null;
    }
}

async function saveMessage(type, requestId, raw) {
    if (pool) {
        try {
            await pool.query(
                "INSERT INTO scout_messages (type, request_id, raw) VALUES ($1, $2, $3)",
                [type, requestId, JSON.stringify(raw)],
            );
            return;
        } catch (err) {
            console.warn("[store] insert failed:", err.message);
        }
    }
    // In-memory fallback
    inMemory.push({ type, request_id: requestId, raw, captured_at: new Date().toISOString() });
    if (inMemory.length > IN_MEMORY_LIMIT) inMemory.splice(0, inMemory.length - IN_MEMORY_LIMIT);
}

async function getLastRequestMessages() {
    if (pool) {
        try {
            // Find the request_id of the most recent FinishRequest
            const rr = await pool.query(
                `SELECT request_id FROM scout_messages
                 WHERE type = 'FinishRequest' AND request_id IS NOT NULL
                 ORDER BY captured_at DESC LIMIT 1`,
            );
            if (rr.rows.length === 0) return [];
            const requestId = rr.rows[0].request_id;
            const mr = await pool.query(
                `SELECT type, request_id, raw, captured_at
                 FROM scout_messages WHERE request_id = $1
                 ORDER BY id ASC`,
                [requestId],
            );
            return mr.rows;
        } catch (err) {
            console.warn("[store] query failed:", err.message);
        }
    }
    // In-memory fallback
    const finishIdx = [...inMemory].reverse().findIndex((m) => m.type === "FinishRequest");
    if (finishIdx === -1) return inMemory.slice(-20);
    const finish = inMemory[inMemory.length - 1 - finishIdx];
    return inMemory.filter((m) => m.request_id === finish.request_id);
}

module.exports = { initDb, saveMessage, getLastRequestMessages };
