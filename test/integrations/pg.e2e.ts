import * as test from "tape";
import * as TestUtil from "../util";
import * as Constants from "../../lib/constants";

import { scoutIntegrationSymbol } from "../../lib/types/integrations";
import { Scout, setupRequireIntegrations } from "../../lib";
setupRequireIntegrations(["pg"]);

import { Client } from "pg";

// NOTE: this test *presumes* that the integration is working, since the integration is require-based
// it may break if import order is changed (require hook would not have taken place)
test("the shim works", t => {
    t.assert(Client[scoutIntegrationSymbol], "client has the integration symbol");
    t.end();
});

// TODO: create a wrapper that creates a dockerized postgres instance

// TODO: test whether SELECT queries are captured
// test("SELECT query works", {timeout: TestUtil.EXPRESS_TEST_TIMEOUT}, t => {
// });
