import * as test from "tape";
import * as TestUtil from "../util";
import * as Constants from "../../lib/constants";

import { scoutIntegrationSymbol } from "../../lib/types/integrations";
import {
    Scout,
    setupRequireIntegrations,
    ScoutEvent,
    buildScoutConfiguration,
    ScoutEventRequestSentData,
} from "../../lib";
setupRequireIntegrations(["pg"]);

import { Client } from "pg";

let PG_CONTAINER_AND_OPTS: TestUtil.ContainerAndOpts | null = null;

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
                const dbSpan = spans.find(s => {
                    return s.operation.includes("database");
                });

                t.assert(dbSpan, "db span was present on request");
            })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Connect to the postgres
        .then(() => TestUtil.makeConnectedPGClient(() => PG_CONTAINER_AND_OPTS))
        .then(client => client.query("SELECT NOW()"))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// Pseudo test that will stop a containerized postgres instance that was started
TestUtil.stopContainerizedPostgresTest(test, () => PG_CONTAINER_AND_OPTS);
