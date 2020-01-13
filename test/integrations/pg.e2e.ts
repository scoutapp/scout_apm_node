import * as test from "tape";
import * as TestUtil from "../util";
import * as Constants from "../../lib/constants";

import { scoutIntegrationSymbol } from "../../lib/types/integrations";
import {
    Scout,
    ScoutEvent,
    ScoutEventRequestSentData,
    ScoutRequest,
    buildScoutConfiguration,
    setupRequireIntegrations,
} from "../../lib";

// The hook for PG has to be triggered this way in a typescript context
// since a partial improt like { Client } will not trigger a require
const pg = require("pg");

import { Client } from "pg";

let PG_CONTAINER_AND_OPTS: TestUtil.ContainerAndOpts | null = null;

const PG_QUERIES = {
    SELECT_TIME: "SELECT NOW()",
};

// NOTE: this test *presumes* that the integration is working, since the integration is require-based
// it may break if import order is changed (require hook would not have taken place)
test("the shim works", t => {
    t.assert(Client[scoutIntegrationSymbol], "client has the integration symbol");
    t.end();
});

// Pseudo test that will start a containerized postgres instance
TestUtil.startContainerizedPostgresTest(test, cao => {
    PG_CONTAINER_AND_OPTS = cao;
});

test("SELECT query during a request is recorded", {timeout: TestUtil.PG_TEST_TIMEOUT}, t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    // Set up a listener for the scout request that will contain the DB record
    const listener = (data: ScoutEventRequestSentData) => {
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // TODO: look up the database span from the request
        data.request
            .getChildSpans()
            .then(spans => {
                const dbSpan = spans.find(s => s.operation === "SQL/Query");
                t.assert(dbSpan, "db span was present on request");
                if (!dbSpan) {
                    t.fail("no DB span present on request");
                    throw new Error("No DB Span");
                }

                t.equals(dbSpan.getContextValue("db.statement"), PG_QUERIES.SELECT_TIME, "db.statement tag is correct");

            })
            .then(() => client.end())
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Activate the listener
    scout.on(ScoutEvent.RequestSent, listener);

    let client: Client;

    scout
        .setup()
    // Connect to the postgres
        .then(() => TestUtil.makeConnectedPGClient(() => PG_CONTAINER_AND_OPTS))
        .then(c => client = c)
    // Start a scout transaction & perform a query
        .then(() => scout.transaction("SQL/Query", done => {
            client.query(PG_QUERIES.SELECT_TIME)
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

// TODO: test with a query that include parameters

// Pseudo test that will stop a containerized postgres instance that was started
TestUtil.stopContainerizedPostgresTest(test, () => PG_CONTAINER_AND_OPTS);