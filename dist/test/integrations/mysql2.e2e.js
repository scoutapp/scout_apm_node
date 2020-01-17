"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const TestUtil = require("../util");
const integrations_1 = require("../../lib/types/integrations");
const lib_1 = require("../../lib");
const types_1 = require("../../lib/types");
const fixtures_1 = require("../fixtures");
// The hook for MYSQL2 has to be triggered this way in a typescript context
// since a partial import like { Client } will not trigger a require
lib_1.setupRequireIntegrations(["mysql2"]);
const mysql2_1 = require("mysql2");
let MYSQL2_CONTAINER_AND_OPTS = null;
// NOTE: this test *presumes* that the integration is working, since the integration is require-based
// it may break if import order is changed (require hook would not have taken place)
test("the shim works", t => {
    const connection = mysql2_1.createConnection({ host: "localhost", user: "mysql2", password: "mysql2" });
    t.assert(integrations_1.scoutIntegrationSymbol in connection, "created connection has the integration symbol");
    t.end();
});
// Pseudo test that will start a containerized mysql2 instance
TestUtil.startContainerizedMySQLTest(test, cao => {
    MYSQL2_CONTAINER_AND_OPTS = cao;
});
test("SELECT query during a request is recorded", t => {
    const scout = new lib_1.Scout(lib_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Setup a MYSQL2 Connection that we'll use later
    let conn;
    // Set up a listener for the scout request that will contain the DB record
    const listener = (data) => {
        scout.removeListener(lib_1.ScoutEvent.RequestSent, listener);
        // Look up the database span from the request
        data.request
            .getChildSpans()
            .then(spans => {
            const dbSpan = spans.find(s => s.operation === "SQL/Query");
            t.assert(dbSpan, "db span was present on request");
            if (!dbSpan) {
                t.fail("no DB span present on request");
                throw new Error("No DB Span");
            }
            t.equals(dbSpan.getContextValue(types_1.ScoutContextNames.DBStatement), fixtures_1.SQL_QUERIES.SELECT_TIME, "db.statement tag is correct");
        })
            .then(() => conn.end())
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => {
            // Shutdown scout and disconnect the connection if present
            TestUtil.shutdownScout(t, scout, err)
                .then(() => conn ? conn.end() : undefined);
        });
    };
    // Activate the listener
    scout.on(lib_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Connect to the mysql2
        .then(() => TestUtil.makeConnectedMySQL2Connection(() => MYSQL2_CONTAINER_AND_OPTS))
        .then(c => conn = c)
        // Start a scout transaction & perform a query
        .then(() => scout.transaction("Controller/select-now-test", finishTransaction => {
        return new Promise((resolve, reject) => {
            // mysql2's query function needs to be wrapped in a promise
            conn.query(fixtures_1.SQL_QUERIES.SELECT_TIME, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                t.pass("query performed");
                resolve(err);
            });
        })
            .then(() => t.comment("performed query"))
            .then(() => finishTransaction());
    }))
        // Finish & Send the request
        .catch(err => {
        TestUtil.shutdownScout(t, scout, err)
            .then(() => conn ? conn.end() : undefined);
    });
});
// Pseudo test that will stop a containerized mysql2 instance that was started
TestUtil.stopContainerizedMySQLTest(test, () => MYSQL2_CONTAINER_AND_OPTS);
