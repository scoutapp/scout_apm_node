import * as test from "tape";
import * as TestUtil from "../util";
import * as Constants from "../../lib/constants";

import { scoutIntegrationSymbol } from "../../lib/types/integrations";
import { Scout, setupRequireIntegrations } from "../../lib";
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
TestUtil.startContainerizedPostgresTest(test, cao => PG_CONTAINER_AND_OPTS = cao, "alpine-latest");

test("SELECT query during a request is recorded", t => {
    t.ok("TODO");
    t.end();
});

// // Pseudo test that will stop a containerized postgres instance that was started
// TestUtil.stopContainerizedPostgresTest(test, PG_CONTAINER_AND_OPTS);
