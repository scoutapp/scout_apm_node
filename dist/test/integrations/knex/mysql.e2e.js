"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const TestUtil = require("../../util");
const types_1 = require("../../../lib/types");
const lib_1 = require("../../../lib");
const scout_1 = require("../../../lib/scout");
const types_2 = require("../../../lib/types");
// The hook for MYSQL has to be triggered this way in a typescript context
// since a partial import like { Client } will not trigger a require
lib_1.setupRequireIntegrations(["mysql"]);
let MYSQL_CONTAINER_AND_OPTS = null;
const Knex = require("knex");
// Pseudo test that will start a containerized mysql instance
TestUtil.startContainerizedMySQLTest(test, cao => {
    MYSQL_CONTAINER_AND_OPTS = cao;
});
test("knex createTable, insert, select", { timeout: TestUtil.MYSQL_TEST_TIMEOUT_MS }, t => {
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Setup a MYSQL Connection that we'll use later
    let conn;
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
        // Return immediately if we odn't find any SQL/Query spans
        const dbSpan = spans.find(s => s.operation === "SQL/Query");
        if (!dbSpan) {
            return;
        }
        const statement = dbSpan.getContextValue(types_2.ScoutContextName.DBStatement);
        if (typeof statement !== "string") {
            throw new Error("statement is invalid type");
        }
        if (statement && statement.includes("CREATE TABLE")) {
            observed.createTable += 1;
            t.pass("observed CREATE TABLE statement");
        }
        if (statement && statement.includes("INSERT")) {
            observed.insert += 1;
            t.pass("observed INSERT statement");
        }
        if (statement && statement.includes("SELECT")) {
            observed.insert += 1;
            t.pass("observed SELECT statement");
        }
        // We expect to see 2 tables created, one insert, and one select reported
        if (observed.createTable !== 2 || observed.insert !== 2 || observed.select !== 1) {
            return;
        }
        t.pass("saw expected statements");
        // Now that we've seen all the expected statements, remove the listener
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Close the connection and shutdown
        k.destroy()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => {
            // Shutdown scout and disconnect the connection if present
            TestUtil.shutdownScout(t, scout, err)
                .then(() => conn ? conn.end() : undefined);
        });
    };
    // Activate the listener
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Start knex and perform queries
        .then(() => {
        if (!MYSQL_CONTAINER_AND_OPTS) {
            return;
        }
        return Knex({
            client: 'mysql',
            connection: {
                host: "localhost",
                port: MYSQL_CONTAINER_AND_OPTS.opts.portBinding[3306],
                user: "root",
                password: "mysql",
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
        .then(() => k.schema.createTable('users', table => {
        table.increments('id'),
            table.string('user_name');
    }))
        .then(() => k.schema.createTable('accounts', table => {
        table.increments('id');
        table.string('account_name');
        table
            .integer('user_id')
            .unsigned()
            .references('users.id');
    }))
        // Insert some records into users and accounts
        .then(() => k('users').insert({ user_name: 'scout' }))
        .then(results => k('accounts').insert({
        account_name: 'knex',
        user_id: results[0],
    }))
        // Query for the data
        .then(() => {
        return k('users')
            .join('accounts', 'users.id', 'accounts.user_id')
            .select('users.user_name as user', 'accounts.account_name as account');
    })
        // Ensure the rows match what we expect
        .then(result => {
        t.equals(result[0].user, "scout", "returned username is scout");
        t.equals(result[0].account, "knex", "returned account is knex");
    })
        // Finish & Send the request
        .catch(err => {
        TestUtil.shutdownScout(t, scout, err)
            .then(() => conn ? conn.end() : undefined);
    });
});
// Pseudo test that will stop a containerized mysql instance that was started
TestUtil.stopContainerizedMySQLTest(test, () => MYSQL_CONTAINER_AND_OPTS);
