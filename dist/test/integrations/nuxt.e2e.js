"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tape_1 = __importDefault(require("tape"));
const lib_1 = require("../../lib");
// The hook for http has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
// *NOTE* this must be here since express is used from TestUtil
(0, lib_1.setupRequireIntegrations)(["express", "nuxt"]);
const integrations_1 = require("../../lib/types/integrations");
(0, tape_1.default)("the shim works", t => {
    t.assert((0, integrations_1.getIntegrationSymbol)() in require("nuxt"), "nuxt export has the integration symbol");
    t.end();
});
// https://github.com/scoutapp/scout_apm_node/issues/200
// TODO: find a way to test nuxt as a part of this without building the entire nuxt project?
