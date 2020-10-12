"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("../../../lib");
// The hook for PG has to be triggered this way in a typescript context
// since a partial import like { Client } will not trigger a require
lib_1.setupRequireIntegrations(["pg"]);
const test = require("tape");
const TestUtil = require("../../util");
const types_1 = require("../../../lib/types");
const scout_1 = require("../../../lib/scout");
const types_2 = require("../../../lib/types");
let PG_CONTAINER_AND_OPTS = null;
const Knex = require("knex");
// Pseudo test that will start a containerized postgres instance
TestUtil.startContainerizedPostgresTest(test, cao => {
    PG_CONTAINER_AND_OPTS = cao;
});
test("knex pg createTable, insert, select", { timeout: TestUtil.PG_TEST_TIMEOUT_MS }, t => {
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Keep track of queries that have been observed
    const observed = {
        createTable: 0,
        insert: 0,
        select: 0,
    };
    // Create the knex instance which will be used
    let k;
    // Set up a listener for the scout request that will contain the DB record
    const listener = (data) => {
        if (!data || !data.request) {
            return;
        }
        const spans = data.request.getChildSpansSync();
        if (!spans || spans.length === 0) {
            return;
        }
        // Return immediately if we odn"t find any SQL/Query spans
        const dbSpan = spans.find(s => s.operation === "SQL/Query");
        if (!dbSpan) {
            return;
        }
        const statement = dbSpan.getContextValue(types_2.ScoutContextName.DBStatement);
        if (typeof statement !== "string") {
            throw new Error("statement is invalid type");
        }
        if (statement && statement.toLowerCase().includes("create table")) {
            observed.createTable += 1;
            t.pass("observed CREATE TABLE statement");
        }
        if (statement && statement.toLowerCase().includes("insert")) {
            observed.insert += 1;
            t.pass("observed INSERT statement");
        }
        if (statement && statement.toLowerCase().includes("select")) {
            observed.select += 1;
            t.pass("observed SELECT statement");
        }
        // We expect to see 2 tables created, one insert, and one select reported
        if (observed.createTable !== 2 || observed.insert !== 2 || observed.select !== 1) {
            return;
        }
        t.pass("saw expected statements");
        // Now that we"ve seen all the expected statements, remove the listener
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Close the connection and shutdown
        k.destroy()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Activate the listener
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Start knex and perform queries
        .then(() => {
        if (!PG_CONTAINER_AND_OPTS) {
            return;
        }
        return Knex({
            client: "pg",
            connection: {
                host: "localhost",
                port: PG_CONTAINER_AND_OPTS.opts.portBinding[5432],
                user: "postgres",
                password: "postgres",
                database: "postgres",
            },
        });
    })
        .then(knexInstance => {
        if (!knexInstance) {
            throw new Error("failed to initialize knex");
        }
        k = knexInstance;
    })
        // Create two tables, users and accounts
        .then(() => k.schema.createTable("users", table => {
        table.increments("id");
        table.string("user_name");
    }))
        .then(() => k.schema.createTable("accounts", table => {
        table.increments("id");
        table.string("account_name");
        table
            .integer("user_id")
            .unsigned()
            .references("users.id");
    }))
        // Insert some records into users and accounts
        .then(() => k("users").insert({ user_name: "scout" }))
        .then(results => k("accounts").insert({
        account_name: "knex",
        user_id: results[0],
    }))
        // Query for the data
        .then(() => {
        return k("users")
            .join("accounts", "users.id", "accounts.user_id")
            .select("users.user_name as user", "accounts.account_name as account");
    })
        // Ensure the rows match what we expect
        .then(result => {
        t.equals(result[0].user, "scout", "returned username is scout");
        t.equals(result[0].account, "knex", "returned account is knex");
    })
        // Finish & Send the request
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// Pseudo test that will stop a containerized postgres instance that was started
TestUtil.stopContainerizedPostgresTest(test, () => PG_CONTAINER_AND_OPTS);
