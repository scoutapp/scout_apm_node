import * as test from "tape";
import * as TestUtil from "../util";
import * as Constants from "../lib/constants";

import { getIntegrationSymbol } from "../lib/types/integrations";
import {
    Scout,
    ScoutEvent,
    ScoutEventRequestSentData,
    ScoutRequest,
    buildScoutConfiguration,
    setupRequireIntegrations,
} from "../lib";

import { ScoutContextName, ScoutSpanOperation } from "../lib/types";

import { SQL_QUERIES } from "./fixtures";

// The hook for PG has to be triggered this way in a typescript context
// since a partial import like { Client } will not trigger a require
setupRequireIntegrations(["pg", "ejs"]);

const ejs = require("ejs");

import { Client } from "pg";

let PG_CONTAINER_AND_OPTS: TestUtil.ContainerAndOpts | null = null;

// Pseudo test that will start a containerized postgres instance
TestUtil.startContainerizedPostgresTest(test, cao => {
    PG_CONTAINER_AND_OPTS = cao;
});

// https://github.com/scoutapp/scout_apm_node/issues/140
test("Many select statments and a render are in the right order", {timeout: TestUtil.PG_TEST_TIMEOUT_MS}, t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    // Setup a PG Client that we'll use later
    let client: Client;

    ///////////////////
    // Postgres code //
    ///////////////////

    // Set up a listener for the scout request that will contain the DB record
    const listener = (data: ScoutEventRequestSentData) => {
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Look up the database span from the request
        data.request
            .getChildSpans()
            .then(spans => {
                const dbSpan = spans.find(s => s.operation === ScoutSpanOperation.SQLQuery);
                t.assert(dbSpan, "db span was present on request");
                if (!dbSpan) {
                    t.fail("no DB span present on request");
                    throw new Error("No DB Span");
                }

                t.equals(
                    dbSpan.getContextValue(ScoutContextName.DBStatement),
                    SQL_QUERIES.SELECT_TIME,
                    "db.statement tag is correct",
                );
            })
            .then(() => client.end())
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => {
                client.end()
                    .then(() => TestUtil.shutdownScout(t, scout, err));
            });
    };

    // Activate the listener
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Connect to the postgres
        .then(() => TestUtil.makeConnectedPGClient(() => PG_CONTAINER_AND_OPTS))
        .then(c => client = c)
    // Start a scout transaction & perform a query
        .then(() => scout.transaction("Controller/select-now-test", done => {
            return client
                .query(SQL_QUERIES.SELECT_TIME)
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
    const app: Application & ApplicationWithScout = TestUtil.simpleHTML5BoilerplateApp(scoutMiddleware({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }), "ejs");

    // Set up a listener that should fire when the request is finished
    const listener = (data: ScoutEventRequestSentData) => {
        // Remove listener since this should fire once
        scout.removeListener(ScoutEvent.RequestSent, listener);

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
        const renderSpan = innerSpans.find(s => s.operation === ScoutSpanOperation.TemplateRender);
        t.assert(renderSpan, "template render span was present on request");
        if (!renderSpan) {
            t.fail("no render span present on request");
            throw new Error("No render span");
        }

        t.assert(renderSpan.getContextValue(ScoutContextName.Name), "template name context is present");

        // Shutdown and close scout
        TestUtil.shutdownScout(t, scout);
    };

    scout.on(ScoutEvent.RequestSent, listener);

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
