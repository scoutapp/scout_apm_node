"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const TestUtil = require("../util");
const integrations_1 = require("../../lib/types/integrations");
const lib_1 = require("../../lib");
const types_1 = require("../../lib/types");
const fixtures_1 = require("../fixtures");
// The hook for PG has to be triggered this way in a typescript context
// since a partial import like { Client } will not trigger a require
lib_1.setupRequireIntegrations(["pg"]);
const pg_1 = require("pg");
let PG_CONTAINER_AND_OPTS = null;
// NOTE: this test *presumes* that the integration is working, since the integration is require-based
// it may break if import order is changed (require hook would not have taken place)
test("the shim works", t => {
    t.assert(pg_1.Client[integrations_1.getIntegrationSymbol()], "client has the integration symbol");
    t.end();
});
// Pseudo test that will start a containerized postgres instance
TestUtil.startContainerizedPostgresTest(test, cao => {
    PG_CONTAINER_AND_OPTS = cao;
});
test("SELECT query during a request is recorded", { timeout: TestUtil.PG_TEST_TIMEOUT_MS }, t => {
    const scout = new lib_1.Scout(lib_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Setup a PG Client that we'll use later
    let client;
    // Set up a listener for the scout request that will contain the DB record
    const listener = (data) => {
        scout.removeListener(lib_1.ScoutEvent.RequestSent, listener);
        // Look up the database span from the request
        data.request
            .getChildSpans()
            .then(spans => {
            const dbSpan = spans.find(s => s.operation === types_1.ScoutSpanOperation.SQLQuery);
            t.assert(dbSpan, "db span was present on request");
            if (!dbSpan) {
                t.fail("no DB span present on request");
                throw new Error("No DB Span");
            }
            t.equals(dbSpan.getContextValue(types_1.ScoutContextName.DBStatement), fixtures_1.SQL_QUERIES.SELECT_TIME, "db.statement tag is correct");
        })
            .then(() => client.end())
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => {
            client.end()
                .then(() => TestUtil.shutdownScout(t, scout, err));
        });
    };
    // Activate the listener
    scout.on(lib_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Connect to the postgres
        .then(() => TestUtil.makeConnectedPGClient(() => PG_CONTAINER_AND_OPTS))
        .then(c => client = c)
        // Start a scout transaction & perform a query
        .then(() => scout.transaction("Controller/select-now-test", done => {
        return client
            .query(fixtures_1.SQL_QUERIES.SELECT_TIME)
            .then(() => {
            t.comment("performed query");
            done();
        });
    }))
        // Finish & Send the request
        .catch(err => {
        client.end()
            .then(() => TestUtil.shutdownScout(t, scout, err));
    });
});
test("CREATE TABLE and INSERT are recorded", { timeout: TestUtil.PG_TEST_TIMEOUT_MS }, t => {
    const scout = new lib_1.Scout(lib_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Set up a listener for the scout request that will contain the DB record
    const listener = (data) => {
        scout.removeListener(lib_1.ScoutEvent.RequestSent, listener);
        // Look up the database span from the request
        data.request
            .getChildSpans()
            .then(spans => {
            const dbSpans = spans.filter(s => s.operation === "SQL/Query");
            t.equal(dbSpans.length, 2, "two db spans were present");
            // Ensure span for CREATE TABLE is present
            const createTableSpan = dbSpans.find(s => {
                return s.getContextValue(types_1.ScoutContextName.DBStatement) === fixtures_1.SQL_QUERIES.CREATE_STRING_KV_TABLE;
            });
            if (!createTableSpan) {
                t.fail("span for CREATE TABLE not found");
                throw new Error("span for create table not found");
            }
            // Ensure span for INSERT is present
            const insertSpan = dbSpans.find(s => {
                return s.getContextValue(types_1.ScoutContextName.DBStatement) === fixtures_1.SQL_QUERIES.INSERT_STRING_KV_TABLE;
            });
            if (!insertSpan) {
                t.fail("span for INSERT not found");
                throw new Error("span for insert not found");
            }
        })
            .then(() => client.end())
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => {
            client.end()
                .then(() => TestUtil.shutdownScout(t, scout, err));
        });
    };
    // Activate the listener
    scout.on(lib_1.ScoutEvent.RequestSent, listener);
    let client;
    scout
        .setup()
        // Connect to the postgres
        .then(() => TestUtil.makeConnectedPGClient(() => PG_CONTAINER_AND_OPTS))
        .then(c => client = c)
        // Start a scout transaction & perform a query
        .then(() => scout.transaction("Controller/create-and-insert-test", done => {
        // Create a string KV table
        return client
            .query(fixtures_1.SQL_QUERIES.CREATE_STRING_KV_TABLE)
            // Insert a value into the string KV
            .then(() => {
            const query = fixtures_1.SQL_QUERIES.INSERT_STRING_KV_TABLE;
            return client.query(query, ["testKey", "testValue"]);
        })
            .then(results => {
            t.equals(results.rowCount, 1, "one row was inserted");
            done();
        });
    }))
        // Finish & Send the request
        .catch(err => {
        client.end()
            .then(() => TestUtil.shutdownScout(t, scout, err));
    });
});
// Pseudo test that will stop a containerized postgres instance that was started
TestUtil.stopContainerizedPostgresTest(test, () => PG_CONTAINER_AND_OPTS);
