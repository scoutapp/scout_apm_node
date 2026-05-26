"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const tape_1 = tslib_1.__importDefault(require("tape"));
const TestUtil = tslib_1.__importStar(require("../util"));
const integrations_1 = require("../../lib/types/integrations");
const types_1 = require("../../lib/types");
const lib_1 = require("../../lib");
const scout_1 = require("../../lib/scout");
const types_2 = require("../../lib/types");
const fixtures_1 = require("../fixtures");
// The hook for MYSQL has to be triggered this way in a typescript context
// since a partial import like { Client } will not trigger a require
(0, lib_1.setupRequireIntegrations)(["mysql"]);
const mysql_1 = require("mysql");
let MYSQL_CONTAINER_AND_OPTS = null;
// NOTE: this test *presumes* that the integration is working, since the integration is require-based
// it may break if import order is changed (require hook would not have taken place)
(0, tape_1.default)("the shim works", t => {
    const connection = (0, mysql_1.createConnection)({ host: "localhost", user: "mysql", password: "mysql" });
    t.assert((0, integrations_1.getIntegrationSymbol)() in connection, "created connection has the integration symbol");
    t.end();
});
// Pseudo test that will start a containerized mysql instance
TestUtil.startContainerizedMySQLTest(tape_1.default, cao => {
    MYSQL_CONTAINER_AND_OPTS = cao;
});
(0, tape_1.default)("SELECT query during a request is recorded", { timeout: TestUtil.MYSQL_TEST_TIMEOUT_MS }, t => {
    const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
    }));
    // Setup a MYSQL Connection that we'll use later
    let conn;
    // Set up a listener for the scout request that will contain the DB record
    const listener = (data) => {
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
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
            t.equals(dbSpan.getContextValue(types_2.ScoutContextName.DBStatement), fixtures_1.SQL_QUERIES.SELECT_TIME, "db.statement tag is correct");
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
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Connect to the mysql
        .then(() => TestUtil.makeConnectedMySQLConnection(() => MYSQL_CONTAINER_AND_OPTS))
        .then(c => conn = c)
        // Start a scout transaction & perform a query
        .then(() => scout.transaction("Controller/select-now-test", finishTransaction => {
        return new Promise((resolve, reject) => {
            // mysql's query function needs to be wrapped in a promise
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
// Pseudo test that will stop a containerized mysql instance that was started
TestUtil.stopContainerizedMySQLTest(tape_1.default, () => MYSQL_CONTAINER_AND_OPTS);
