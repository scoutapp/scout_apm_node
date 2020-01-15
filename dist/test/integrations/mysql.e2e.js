"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const TestUtil = require("../util");
const integrations_1 = require("../../lib/types/integrations");
// The hook for MYSQL has to be triggered this way in a typescript context
// since a partial improt like { Client } will not trigger a require
const mysql = require("mysql");
let MYSQL_CONTAINER_AND_OPTS = null;
// NOTE: this test *presumes* that the integration is working, since the integration is require-based
// it may break if import order is changed (require hook would not have taken place)
test("the shim works", t => {
    const connection = mysql.createConnection({ host: "localhost", user: "mysql", password: "mysql" });
    t.assert([integrations_1.scoutIntegrationSymbol], "client has the integration symbol");
    t.end();
});
// Pseudo test that will start a containerized postgres instance
TestUtil.startContainerizedMySQLTest(test, cao => {
    MYSQL_CONTAINER_AND_OPTS = cao;
});
// test("SELECT query during a request is recorded", {timeout: TestUtil.MYSQL_TEST_TIMEOUT}, t => {
//     const scout = new Scout(buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     }));
//     // Setup a MYSQL Client that we'll use later
//     let client: Client;
//     // Set up a listener for the scout request that will contain the DB record
//     const listener = (data: ScoutEventRequestSentData) => {
//         scout.removeListener(ScoutEvent.RequestSent, listener);
//         // Look up the database span from the request
//         data.request
//             .getChildSpans()
//             .then(spans => {
//                 const dbSpan = spans.find(s => s.operation === "SQL/Query");
//                 t.assert(dbSpan, "db span was present on request");
//                 if (!dbSpan) {
//                     t.fail("no DB span present on request");
//                     throw new Error("No DB Span");
//                 }
//                 t.equals(dbSpan.getContextValue("db.statement"), SQL_QUERIES.SELECT_TIME, "db.statement tag is correct");
//             })
//             .then(() => client.end())
//             .then(() => TestUtil.shutdownScout(t, scout))
//             .catch(err => {
//                 client.end()
//                     .then(() => TestUtil.shutdownScout(t, scout, err));
//             });
//     };
//     // Activate the listener
//     scout.on(ScoutEvent.RequestSent, listener);
//     scout
//         .setup()
//     // Connect to the postgres
//         .then(() => TestUtil.makeConnectedMYSQLClient(() => MYSQL_CONTAINER_AND_OPTS))
//         .then(c => client = c)
//     // Start a scout transaction & perform a query
//         .then(() => scout.transaction("Controller/select-now-test", done => {
//             return client
//                 .query(SQL_QUERIES.SELECT_TIME)
//                 .then(() => {
//                     t.comment("performed query");
//                     done();
//                 });
//         }))
//     // Finish & Send the request
//         .catch(err => {
//             client.end()
//                 .then(() => TestUtil.shutdownScout(t, scout, err));
//         });
// });
// test("CREATE TABLE and INSERT are recorded", {timeout: TestUtil.MYSQL_TEST_TIMEOUT}, t => {
//     const scout = new Scout(buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     }));
//     // Set up a listener for the scout request that will contain the DB record
//     const listener = (data: ScoutEventRequestSentData) => {
//         scout.removeListener(ScoutEvent.RequestSent, listener);
//         // Look up the database span from the request
//         data.request
//             .getChildSpans()
//             .then(spans => {
//                 const dbSpans = spans.filter(s => s.operation === "SQL/Query");
//                 t.equal(dbSpans.length, 2, "two db spans were present");
//                 // Ensure span for CREATE TABLE is present
//                 const createTableSpan = dbSpans.find(s => {
//                     return s.getContextValue("db.statement") === SQL_QUERIES.CREATE_STRING_KV_TABLE;
//                 });
//                 if (!createTableSpan) {
//                     t.fail("span for CREATE TABLE not found");
//                     throw new Error("span for create table not found");
//                 }
//                 // Ensure span for INSERT is present
//                 const insertSpan = dbSpans.find(s => {
//                     return s.getContextValue("db.statement") === SQL_QUERIES.INSERT_STRING_KV_TABLE;
//                 });
//                 if (!insertSpan) {
//                     t.fail("span for INSERT not found");
//                     throw new Error("span for insert not found");
//                 }
//             })
//             .then(() => client.end())
//             .then(() => TestUtil.shutdownScout(t, scout))
//             .catch(err => {
//                 client.end()
//                     .then(() => TestUtil.shutdownScout(t, scout, err));
//             });
//     };
//     // Activate the listener
//     scout.on(ScoutEvent.RequestSent, listener);
//     let client: Client;
//     scout
//         .setup()
//     // Connect to the postgres
//         .then(() => TestUtil.makeConnectedMYSQLClient(() => MYSQL_CONTAINER_AND_OPTS))
//         .then(c => client = c)
//     // Start a scout transaction & perform a query
//         .then(() => scout.transaction("Controller/create-and-insert-test", done => {
//             // Create a string KV table
//             return client
//                 .query(SQL_QUERIES.CREATE_STRING_KV_TABLE)
//             // Insert a value into the string KV
//                 .then(() => {
//                     const query = SQL_QUERIES.INSERT_STRING_KV_TABLE;
//                     return client.query(query, ["testKey", "testValue"]);
//                 })
//                 .then(results => {
//                     t.equals(results.rowCount, 1, "one row was inserted");
//                     done();
//                 });
//         }))
//     // Finish & Send the request
//         .catch(err => {
//             client.end()
//                 .then(() => TestUtil.shutdownScout(t, scout, err));
//         });
// });
// Pseudo test that will stop a containerized postgres instance that was started
TestUtil.stopContainerizedMySQLTest(test, () => MYSQL_CONTAINER_AND_OPTS);
