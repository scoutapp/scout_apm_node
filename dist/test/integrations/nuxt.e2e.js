"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const lib_1 = require("../../lib");
// The hook for http has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
// *NOTE* this must be here since express is used from TestUtil
lib_1.setupRequireIntegrations(["express", "nuxt"]);
const integrations_1 = require("../../lib/types/integrations");
test("the shim works", t => {
    t.assert(integrations_1.getIntegrationSymbol() in require("nuxt"), "nuxt export has the integration symbol");
    t.end();
});
// https://github.com/scoutapp/scout_apm_node/issues/200
// TODO: find a way to test nuxt as a part of this without building the entire nuxt project?
