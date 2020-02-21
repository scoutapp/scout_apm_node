"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const TestUtil = require("../util");
const lib_1 = require("../lib");
const types_1 = require("../lib/types");
const fixtures_1 = require("./fixtures");
// The hook for PG has to be triggered this way in a typescript context
// since a partial import like { Client } will not trigger a require
lib_1.setupRequireIntegrations(["pg", "ejs"]);
const ejs = require("ejs");
let PG_CONTAINER_AND_OPTS = null;
// Pseudo test that will start a containerized postgres instance
TestUtil.startContainerizedPostgresTest(test, cao => {
    PG_CONTAINER_AND_OPTS = cao;
});
// https://github.com/scoutapp/scout_apm_node/issues/140
test("Many select statments and a render are in the right order", { timeout: TestUtil.PG_TEST_TIMEOUT_MS }, t => {
    const scout = new lib_1.Scout(lib_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Setup a PG Client that we'll use later
    let client;
    ///////////////////
    // Postgres code //
    ///////////////////
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
    //////////////
    // EJS code //
    //////////////
    // Create an application that's set up to use ejs templating
    const app = TestUtil.simpleHTML5BoilerplateApp(scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
    }), "ejs");
    // Set up a listener that should fire when the request is finished
    const listener = (data) => {
        // Remove listener since this should fire once
        scout.removeListener(lib_1.ScoutEvent.RequestSent, listener);
        // Look up the template render span from the request
        const requestSpans = data.request.getChildSpansSync();
        // The top level controller should be present
        const controllerSpan = requestSpans.find(s => s.operation.includes("Controller/"));
        t.assert(controllerSpan, "template controller span was present on request");
        if (!controllerSpan) {
            t.fail("no controller span present on request");
            throw new Error("No controller span");
        }
        // The inner spans for the controller should contain a template rendering span
        const innerSpans = controllerSpan.getChildSpansSync();
        const renderSpan = innerSpans.find(s => s.operation === types_1.ScoutSpanOperation.TemplateRender);
        t.assert(renderSpan, "template render span was present on request");
        if (!renderSpan) {
            t.fail("no render span present on request");
            throw new Error("No render span");
        }
        t.assert(renderSpan.getContextValue(types_1.ScoutContextName.Name), "template name context is present");
        // Shutdown and close scout
        TestUtil.shutdownScout(t, scout);
    };
    scout.on(lib_1.ScoutEvent.RequestSent, listener);
    return request(app)
        .get("/")
        .expect("Content-Type", /html/)
        .expect(200)
        .then(res => {
        t.assert(res.text.includes("<title>dynamic</title>"), "dynamic template was rendered by express");
    })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// Pseudo test that will stop a containerized postgres instance that was started
TestUtil.stopContainerizedPostgresTest(test, () => PG_CONTAINER_AND_OPTS);
