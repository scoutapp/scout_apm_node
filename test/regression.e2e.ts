import * as test from "tape";
import { inspect } from "util";
import * as request from "supertest";
import { Application } from "express";

import {
    Scout,
    ScoutEvent,
    ScoutEventRequestSentData,
    ScoutRequest,
    buildScoutConfiguration,
    setupRequireIntegrations,
} from "../lib";

// This needs to be set up *before* TestUtil runs so pg used there will be instrumented
setupRequireIntegrations(["pg", "ejs"]);

import * as TestUtil from "./util";
import * as Constants from "../lib/constants";
import { scoutMiddleware, ApplicationWithScout } from "../lib/express";
import { getIntegrationSymbol } from "../lib/types/integrations";

import { ScoutContextName, ScoutSpanOperation } from "../lib/types";

import { SQL_QUERIES } from "./fixtures";

const ejs = require("ejs");

import { Client } from "pg";

let PG_CONTAINER_AND_OPTS: TestUtil.ContainerAndOpts | null = null;

// Pseudo test that will start a containerized postgres instance
TestUtil.startContainerizedPostgresTest(test, cao => {
    PG_CONTAINER_AND_OPTS = cao;
});

// https://github.com/scoutapp/scout_apm_node/issues/140
test("Many select statments and a render are in the right order", {timeout: TestUtil.PG_TEST_TIMEOUT_MS * 1000}, t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    // Setup a PG Client that we'll use later
    let client: Client;

    // Set up a listener for the scout request that will be sent for the endpoint being hit
    const listener = (data: ScoutEventRequestSentData) => {
        scout.removeListener(ScoutEvent.RequestSent, listener);
        console.log("REQUEST:", inspect(TestUtil.minimal(data.request), false, null, true))

        // Look up the database span from the request
        const requestSpans = data.request.getChildSpansSync();

        const controllerSpan = requestSpans.find(s => s.operation.includes("Controller/"));
        if (!controllerSpan) {
            t.fail("no ControllerSpan span");
            throw new Error("No DB Span");
        }

        const innerSpans = controllerSpan.getChildSpansSync();

        // Check for the inner SQL query spans
        const dbSpans = innerSpans.filter(s => s.operation === ScoutSpanOperation.SQLQuery);
        t.assert(dbSpans, `db spans [${dbSpans.length}] were present on request`);
        if (!dbSpans || dbSpans.length === 0) {
            t.fail("no DB spans present on request");
            throw new Error("No DB spans");
        }

        // All the DB spans should have the controllerSpan as parent
        t.assert(
            dbSpans.every(s => s.parent && s.parent.id === controllerSpan.id),
            "db spans have controller as parent",
        );

        // Check for the inner render spans
        const renderSpans = innerSpans.filter(s => s.operation === ScoutSpanOperation.TemplateRender);
        t.assert(renderSpans, `render spans [${renderSpans.length}] were present on request`);
        t.equals(renderSpans.length, 1, "only one render span is present");

        const renderSpan = renderSpans[0];
        if (!renderSpan) {
            t.fail("no render span present on request");
            throw new Error("No Render span");
        }

        // Ensure controller span has controller as parent
        t.assert(
            renderSpan.parent && renderSpan.parent.id === controllerSpan.id,
            "render span has controller as parent",
        );

        // Check that none of the SQL query spans overlap with the render span
        t.assert(
            dbSpans.every(dbSpan => dbSpan.getEndTime() <= renderSpan.getTimestamp()),
            "All DB spans end before the render span starts",
        );

        // Close the PG client & shutdown
        client.end()
            .then(() => TestUtil.waitMinutes(3))
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => {
                client.end()
                    .then(() => TestUtil.shutdownScout(t, scout, err));
            });
    };

    let app: Application & ApplicationWithScout;

    // Activate the listener
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Connect to the postgres
        .then(() => TestUtil.makeConnectedPGClient(() => PG_CONTAINER_AND_OPTS))
        .then(c => client = c)
    // Build the app with the postgres client
        .then(() => {
            // Create an application will do many queries and render something using ejs
            app = TestUtil.queryAndRenderRandomNumbers(scoutMiddleware({
                scout,
                requestTimeoutMs: 0, // disable request timeout to stop test from hanging
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
