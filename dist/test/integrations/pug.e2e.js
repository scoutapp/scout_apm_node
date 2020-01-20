"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const integrations_1 = require("../../lib/types/integrations");
// The hook for pug has to be triggered this way in a typescript context
// since a partial import like { Client } will not trigger a require
const pug = require("pug");
test("the shim works", t => {
    t.assert(integrations_1.scoutIntegrationSymbol in pug, "pug export has the integration symbol");
    t.end();
});
