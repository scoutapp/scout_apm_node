"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("../../lib");
// The hook for PG has to be triggered this way in a typescript context
// since a partial import like { Client } will not trigger a require
lib_1.setupRequireIntegrations(["pg"]);
const sequelize_1 = require("sequelize");
const test = require("tape");
const TestUtil = require("../util");
const types_1 = require("../../lib/types");
const scout_1 = require("../../lib/scout");
let PG_CONTAINER_AND_OPTS = null;
// // NOTE: this test *presumes* that the integration is working, since the integration is require-based
// // it may break if import order is changed (require hook would not have taken place)
// test("the shim works", t => {
//     t.assert(Client[getIntegrationSymbol()], "client has the integration symbol");
//     t.end();
// });
// Pseudo test that will start a containerized postgres instance
TestUtil.startContainerizedPostgresTest(test, cao => {
    PG_CONTAINER_AND_OPTS = cao;
});
// test("SELECT query during a request is recorded", {timeout: TestUtil.PG_TEST_TIMEOUT_MS}, t => {
//     const scout = new Scout(buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     }));
//     // Setup a PG Client that we'll use later
//     let client: Client;
//     // Set up a listener for the scout request that will contain the DB record
//     const listener = (data: ScoutEventRequestSentData) => {
//         scout.removeListener(ScoutEvent.RequestSent, listener);
//         // Look up the database span from the request
//         data.request
//             .getChildSpans()
//             .then(spans => {
//                 const dbSpan = spans.find(s => s.operation === ScoutSpanOperation.SQLQuery);
//                 t.assert(dbSpan, "db span was present on request");
//                 if (!dbSpan) {
//                     t.fail("no DB span present on request");
//                     throw new Error("No DB Span");
//                 }
//                 t.equals(
//                     dbSpan.getContextValue(ScoutContextName.DBStatement),
//                     SQL_QUERIES.SELECT_TIME,
//                     "db.statement tag is correct",
//                 );
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
//         .then(() => TestUtil.makeConnectedPGClient(() => PG_CONTAINER_AND_OPTS))
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
// test("CREATE TABLE and INSERT are recorded", {timeout: TestUtil.PG_TEST_TIMEOUT_MS}, t => {
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
//                     return s.getContextValue(ScoutContextName.DBStatement) === SQL_QUERIES.CREATE_STRING_KV_TABLE;
//                 });
//                 if (!createTableSpan) {
//                     t.fail("span for CREATE TABLE not found");
//                     throw new Error("span for create table not found");
//                 }
//                 // Ensure span for INSERT is present
//                 const insertSpan = dbSpans.find(s => {
//                     return s.getContextValue(ScoutContextName.DBStatement) === SQL_QUERIES.INSERT_STRING_KV_TABLE;
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
//         .then(() => TestUtil.makeConnectedPGClient(() => PG_CONTAINER_AND_OPTS))
//         .then(c => client = c)
//     // Start a scout transaction & perform a query
//         .then(() => scout.transaction("Controller/create-and-insert-test", done => {
//             // Create a string KV table
//             return client
//                 .query(SQL_QUERIES.CREATE_STRING_KV_TABLE)
//             // Insert a value into the string KV
//                 .then(() => {
//                     const query = SQL_QUERIES.INSERT_STRING_KV_TABLE;
//                     const result = client.query(query, ["testKey", "testValue"]);
//                     return result;
//                 })
//                 .then(results => {
//                     t.equals(results.rowCount, 1, "one row was inserted");
//                     done();
//                 });
//         }))
//     // Finish & Send the request
//         .catch(err => {
//             (client ? client.end() : Promise.resolve())
//                 .then(() => TestUtil.shutdownScout(t, scout, err));
//         });
// });
// https://github.com/scoutapp/scout_apm_node/issues/191
test("sequelize basic authenticate works", { timeout: TestUtil.PG_TEST_TIMEOUT_MS }, t => {
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Set up a listener for the scout request that will contain the DB record
    const listener = (data) => {
        // Ensure that we have the span we expect as top level
        const spans = data.request.getChildSpansSync();
        const mainSpan = spans.find(s => s.operation === "Controller/create-and-insert-test");
        // If we haven't found a request w/ our top level span then exit (and continue listening)
        if (!mainSpan) {
            return;
        }
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Look up the database span from the request
        mainSpan
            .getChildSpans()
            .then(spans => {
            // const dbSpans = spans.filter(s => s.operation === "SQL/Query");
            // t.equal(dbSpans.length, 1, "one db span was present");
            // // Sequelize happens to do 'SELECT 1+1 AS result' as a test, find that span
            // const selectSpan = dbSpans.find(s => {
            //     let v = s.getContextValue(ScoutContextName.DBStatement);
            //     return v && typeof v === "string" && v.includes("SELECT 1+1");
            // });
            // if (!selectSpan) {
            //     t.fail("span for INSERT not found");
            //     throw new Error("span for insert not found");
            // }
            t.pass("ran the child pans stuff");
        })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Activate the listener
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    let client;
    let connString;
    scout
        .setup()
        // Create the connection string for sequelize to use
        .then(() => TestUtil.makePGConnectionString(() => PG_CONTAINER_AND_OPTS))
        .then(s => connString = s)
        // Start an instrumentation (which auto creates a request)
        .then(() => scout.instrument("Controller/create-and-insert-test", done => {
        // Create sequelize client (this could fail if PG_CONTAINER_AND_OPTS is invalid
        const sequelize = new sequelize_1.Sequelize(connString);
        // Test connection
        return sequelize.authenticate()
            .then(() => t.pass("sequelize authenticate call succeeded"))
            .then(() => done());
    }))
        // Finish & Send the request
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// TODO: Test the usual create and insert
// // https://github.com/scoutapp/scout_apm_node/issues/191
// test("sequelize library works", {timeout: TestUtil.PG_TEST_TIMEOUT_MS}, t => {
//     const scout = new Scout(buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     }));
//     // Set up a listener for the scout request that will contain the DB record
//     const listener = (data: ScoutEventRequestSentData) => {
//         // Ensure that we have the span we expect as top level
//         const spans = data.request.getChildSpansSync();
//         const mainSpan = spans.find(s => s.operation === "Controller/create-and-insert-test");
//         // If we haven't found a request w/ our top level span then exit (and continue listening)
//         if (!mainSpan) { return; }
//         scout.removeListener(ScoutEvent.RequestSent, listener);
//         // Look up the database span from the request
//         mainSpan
//             .getChildSpans()
//             .then(spans => {
//                 // const dbSpans = spans.filter(s => s.operation === "SQL/Query");
//                 // t.equal(dbSpans.length, 2, "two db spans were present");
//                 // // Ensure span for CREATE TABLE is present
//                 // const createTableSpan = dbSpans.find(s => {
//                 //     return s.getContextValue(ScoutContextName.DBStatement) === SQL_QUERIES.CREATE_STRING_KV_TABLE;
//                 // });
//                 // if (!createTableSpan) {
//                 //     t.fail("span for CREATE TABLE not found");
//                 //     throw new Error("span for create table not found");
//                 // }
//                 // // Ensure span for INSERT is present
//                 // const insertSpan = dbSpans.find(s => {
//                 //     return s.getContextValue(ScoutContextName.DBStatement) === SQL_QUERIES.INSERT_STRING_KV_TABLE;
//                 // });
//                 // if (!insertSpan) {
//                 //     t.fail("span for INSERT not found");
//                 //     throw new Error("span for insert not found");
//                 // }
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
//     let connString: string;
//     scout
//         .setup()
//     // Create the connection string for sequelize to use
//         .then(() => TestUtil.makePGConnectionString(() => PG_CONTAINER_AND_OPTS))
//         .then(s => connString = s)
//     // Start an instrumentation (which auto creates a request)
//         .then(() => scout.instrument("Controller/create-and-insert-test", done => {
//             // Create sequelize client (this could fail if PG_CONTAINER_AND_OPTS is invalid
//             const sequelize = new Sequelize(connString);
//             // Test connection
//             return sequelize.authenticate()
//                 .then(() => t.pass("sequelize authenticate succeeded"))
//                 .then(() => done());
//             // // Create a string KV table
//             // return client
//             //     .query(SQL_QUERIES.CREATE_STRING_KV_TABLE)
//             // // Insert a value into the string KV
//             //     .then(() => client.query(SQL_QUERIES.INSERT_STRING_KV_TABLE, ["testKey", "testValue"]))
//             //     .then(results => {
//             //         t.equals(results.rowCount, 1, "one row was inserted");
//             //         done();
//             //     });
//         }))
//     // Finish & Send the request
//         .catch(err => {
//             (client ? client.end() : Promise.resolve())
//                 .then(() => TestUtil.shutdownScout(t, scout, err));
//         });
// });
// Pseudo test that will stop a containerized postgres instance that was started
TestUtil.stopContainerizedPostgresTest(test, () => PG_CONTAINER_AND_OPTS);
