import { setupRequireIntegrations } from "../../lib";
setupRequireIntegrations(["sequelize"]);

import { Sequelize, DataTypes } from "sequelize";
import * as test from "tape";
import * as TestUtil from "../util";
import { getIntegrationSymbol } from "../../lib/types/integrations";
import { ScoutEvent, buildScoutConfiguration } from "../../lib/types";
import { Scout, ScoutEventRequestSentData } from "../../lib/scout";
import { MockAgent } from "../integration/mock-agent";

const PG_HOST = process.env.PGHOST || "127.0.0.1";
const PG_PORT = parseInt(process.env.PGPORT || "5432", 10);
const PG_USER = process.env.PGUSER || "postgres";
const PG_PASSWORD = process.env.PGPASSWORD || "postgres";
const PG_DB = process.env.PGDATABASE || "scout_sequelize_test";
const TIMEOUT_MS = 20000;

const sharedMock = new MockAgent();

function makeSequelize(): Sequelize {
    return new Sequelize(PG_DB, PG_USER, PG_PASSWORD, {
        host: PG_HOST,
        port: PG_PORT,
        dialect: "postgres",
        logging: false,
    });
}

function makeUserModel(seq: Sequelize) {
    return seq.define("User", {
        name: { type: DataTypes.STRING, allowNull: false },
        email: { type: DataTypes.STRING, allowNull: false },
    }, { tableName: "sequelize_test_users", timestamps: false });
}

test("setup: start shared mock agent", (t) => {
    sharedMock.start().then(() => t.end()).catch(t.end);
});

test("sequelize Sequelize class has integration symbol", (t) => {
    const { Sequelize: Seq } = require("sequelize");
    t.ok((Seq as any)[getIntegrationSymbol()], "Sequelize class has integration symbol");
    t.end();
});

test("SQL/Query span created for findAll", { timeout: TIMEOUT_MS }, (t) => {
    const seq = makeSequelize();
    const User = makeUserModel(seq);
    const scout = new Scout(buildScoutConfiguration({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    const cleanup = (err?: any) => seq.close().then(() => TestUtil.shutdownScout(t, scout, err));

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const sqlSpan = spans.find((s) => s.operation === "SQL/Query");
        if (!sqlSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);

        t.ok(sqlSpan, "SQL/Query span present");
        const stmt = sqlSpan.getContextValue("db.statement");
        t.ok(stmt && String(stmt).toUpperCase().includes("SELECT"), "db.statement contains SELECT");

        cleanup().catch((e) => t.end(e));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => seq.sync({ force: true }))
        .then(() => scout.transaction("Controller/GET /users", (finish) => {
            return User.findAll().then(() => finish());
        }))
        .catch(cleanup);
});

test("SQL/Query span created for create", { timeout: TIMEOUT_MS }, (t) => {
    const seq = makeSequelize();
    const User = makeUserModel(seq);
    const scout = new Scout(buildScoutConfiguration({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    const cleanup = (err?: any) => seq.close().then(() => TestUtil.shutdownScout(t, scout, err));

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const sqlSpan = spans.find((s) => {
            const stmt = s.getContextValue("db.statement");
            return s.operation === "SQL/Query" && stmt && String(stmt).toUpperCase().includes("INSERT");
        });
        if (!sqlSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);

        t.ok(sqlSpan, "SQL/Query INSERT span present");
        const stmt = sqlSpan.getContextValue("db.statement");
        t.ok(stmt && String(stmt).toUpperCase().includes("INSERT"), "db.statement contains INSERT");

        cleanup().catch((e) => t.end(e));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => seq.sync({ force: true }))
        .then(() => scout.transaction("Controller/POST /users", (finish) => {
            return User.create({ name: "Alice", email: "alice@example.com" }).then(() => finish());
        }))
        .catch(cleanup);
});

test("SQL/Query span created for raw query", { timeout: TIMEOUT_MS }, (t) => {
    const seq = makeSequelize();
    const User = makeUserModel(seq);
    const scout = new Scout(buildScoutConfiguration({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    const cleanup = (err?: any) => seq.close().then(() => TestUtil.shutdownScout(t, scout, err));

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const sqlSpan = spans.find((s) => {
            const stmt = s.getContextValue("db.statement");
            return s.operation === "SQL/Query" && stmt && String(stmt).includes("sequelize_test_users");
        });
        if (!sqlSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);

        t.ok(sqlSpan, "SQL/Query span present for raw query");
        const stmt = sqlSpan.getContextValue("db.statement");
        t.ok(stmt && String(stmt).includes("sequelize_test_users"), "db.statement contains raw SQL");

        cleanup().catch((e) => t.end(e));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => seq.sync({ force: true }))
        .then(() => scout.transaction("Controller/GET /raw", (finish) => {
            return seq.query("SELECT * FROM sequelize_test_users").then(() => finish());
        }))
        .catch(cleanup);
});

test("error flag set when query fails", { timeout: TIMEOUT_MS }, (t) => {
    const seq = makeSequelize();
    const scout = new Scout(buildScoutConfiguration({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    const cleanup = (err?: any) => seq.close().then(() => TestUtil.shutdownScout(t, scout, err));

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const sqlSpan = spans.find((s) => s.operation === "SQL/Query");
        if (!sqlSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);

        t.equal(sqlSpan.getContextValue("error"), "true", "error context is 'true' on failed query");

        cleanup().catch((e) => t.end(e));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => scout.transaction("Controller/GET /bad", (finish) => {
            return seq.query("SELECT * FROM table_that_does_not_exist_xyz")
                .catch(() => undefined)
                .then(() => finish());
        }))
        .catch(cleanup);
});

test("teardown: stop shared mock agent", (t) => {
    sharedMock.stop().then(() => t.end()).catch(t.end);
});
