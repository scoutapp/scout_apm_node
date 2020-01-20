"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const integrations_1 = require("../../lib/types/integrations");
const lib_1 = require("../../lib");
// The hook for pug has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
lib_1.setupRequireIntegrations(["pug"]);
// pug needs to be imported this way to trigger the require integration
const pug = require("pug");
test("the shim works", t => {
    t.assert(integrations_1.scoutIntegrationSymbol in pug, "pug export has the integration symbol");
    t.end();
});
