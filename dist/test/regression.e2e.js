"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const util_1 = require("util");
const request = require("supertest");
const lib_1 = require("../lib");
// This needs to be set up *before* TestUtil runs so pg used there will be instrumented
lib_1.setupRequireIntegrations(["pg", "ejs"]);
const TestUtil = require("./util");
const express_1 = require("../lib/express");
const types_1 = require("../lib/types");
const ejs = require("ejs");
let PG_CONTAINER_AND_OPTS = null;
// Pseudo test that will start a containerized postgres instance
TestUtil.startContainerizedPostgresTest(test, cao => {
    PG_CONTAINER_AND_OPTS = cao;
});
// https://github.com/scoutapp/scout_apm_node/issues/140
test("Many select statments and a render are in the right order", { timeout: TestUtil.PG_TEST_TIMEOUT_MS * 1000 }, t => {
    const scout = new lib_1.Scout(lib_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Setup a PG Client that we'll use later
    let client;
    // Set up a listener for the scout request that will be sent for the endpoint being hit
    const listener = (data) => {
        scout.removeListener(lib_1.ScoutEvent.RequestSent, listener);
        console.log("REQUEST:", util_1.inspect(TestUtil.minimal(data.request), false, null, true));
        // Look up the database span from the request
        const requestSpans = data.request.getChildSpansSync();
        const controllerSpan = requestSpans.find(s => s.operation.includes("Controller/"));
        if (!controllerSpan) {
            t.fail("no ControllerSpan span");
            throw new Error("No DB Span");
        }
        const innerSpans = controllerSpan.getChildSpansSync();
        // Check for the inner SQL query spans
        const dbSpans = innerSpans.filter(s => s.operation === types_1.ScoutSpanOperation.SQLQuery);
        t.assert(dbSpans, `db spans [${dbSpans.length}] were present on request`);
        if (!dbSpans || dbSpans.length === 0) {
            t.fail("no DB spans present on request");
            throw new Error("No DB spans");
        }
        // All the DB spans should have the controllerSpan as parent
        t.assert(dbSpans.every(s => s.parent && s.parent.id === controllerSpan.id), "db spans have controller as parent");
        // Check for the inner render spans
        const renderSpans = innerSpans.filter(s => s.operation === types_1.ScoutSpanOperation.TemplateRender);
        t.assert(renderSpans, `render spans [${renderSpans.length}] were present on request`);
        t.equals(renderSpans.length, 1, "only one render span is present");
        const renderSpan = renderSpans[0];
        if (!renderSpan) {
            t.fail("no render span present on request");
            throw new Error("No Render span");
        }
        // Ensure controller span has controller as parent
        t.assert(renderSpan.parent && renderSpan.parent.id === controllerSpan.id, "render span has controller as parent");
        // Check that none of the SQL query spans overlap with the render span
        t.assert(dbSpans.every(dbSpan => dbSpan.getEndTime() <= renderSpan.getTimestamp()), "All DB spans end before the render span starts");
        // Close the PG client & shutdown
        client.end()
            .then(() => TestUtil.waitMinutes(3))
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => {
            client.end()
                .then(() => TestUtil.shutdownScout(t, scout, err));
        });
    };
    let app;
    // Activate the listener
    scout.on(lib_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Connect to the postgres
        .then(() => TestUtil.makeConnectedPGClient(() => PG_CONTAINER_AND_OPTS))
        .then(c => client = c)
        // Build the app with the postgres client
        .then(() => {
        // Create an application will do many queries and render something using ejs
        app = TestUtil.queryAndRenderRandomNumbers(express_1.scoutMiddleware({
            scout,
            requestTimeoutMs: 0,
        }), "ejs", client);
    })
        // Perform the request to trigger the queries & render
        .then(() => {
        return request(app)
            .get("/")
            .expect("Content-Type", /text/)
            .expect(200)
            .then(res => {
            t.assert(res.text.includes("Random numbers (generated)"), "html contains title");
            t.assert(res.text.includes("<li>"), "html contains at least one <li> tag");
        });
    })
        .catch(err => {
        client.end()
            .then(() => TestUtil.shutdownScout(t, scout, err));
    });
});
// Pseudo test that will stop a containerized postgres instance that was started
TestUtil.stopContainerizedPostgresTest(test, () => PG_CONTAINER_AND_OPTS);
