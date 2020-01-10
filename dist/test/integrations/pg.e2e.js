"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const TestUtil = require("../util");
const integrations_1 = require("../../lib/types/integrations");
const lib_1 = require("../../lib");
lib_1.setupRequireIntegrations(["pg"]);
const pg_1 = require("pg");
let PG_CONTAINER_AND_OPTS = null;
// NOTE: this test *presumes* that the integration is working, since the integration is require-based
// it may break if import order is changed (require hook would not have taken place)
test("the shim works", t => {
    t.assert(pg_1.Client[integrations_1.scoutIntegrationSymbol], "client has the integration symbol");
    t.end();
});
// Pseudo test that will start a containerized postgres instance
TestUtil.startContainerizedPostgresTest(test, cao => {
    PG_CONTAINER_AND_OPTS = cao;
});
test("SELECT query during a request is recorded", { timeout: TestUtil.PG_TEST_TIMEOUT }, t => {
    const scout = new lib_1.Scout(lib_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Set up a listener for the scout request that will contain the DB record
    const listener = (data) => {
        scout.removeListener(lib_1.ScoutEvent.RequestSent, listener);
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
    scout.on(lib_1.ScoutEvent.RequestSent, listener);
    let req;
    scout
        .setup()
        // Start a request
        .then(() => scout.startRequest())
        .then(r => req = r)
        // Connect to the postgres & perform a query
        .then(() => TestUtil.makeConnectedPGClient(() => PG_CONTAINER_AND_OPTS))
        .then(client => client.query("SELECT NOW()"))
        // Finish & Send the request
        .then(() => req.finishAndSend())
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// Pseudo test that will stop a containerized postgres instance that was started
TestUtil.stopContainerizedPostgresTest(test, () => PG_CONTAINER_AND_OPTS);
