"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const integrations_1 = require("../../lib/types/integrations");
const lib_1 = require("../../lib");
lib_1.setupRequireIntegrations(["pg"]);
const pg_1 = require("pg");
// NOTE: this test *presumes* that the integration is working, since the integration is require-based
// it may break if import order is changed (require hook would not have taken place)
test("the shim works", t => {
    t.assert(pg_1.Client[integrations_1.scoutIntegrationSymbol], "client has the integration symbol");
    t.end();
});
// TODO: create a wrapper that creates a dockerized postgres instance
// TODO: test whether SELECT queries are captured
// test("SELECT query works", {timeout: TestUtil.EXPRESS_TEST_TIMEOUT}, t => {
// });
