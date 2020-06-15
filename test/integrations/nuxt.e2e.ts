import * as test from "tape";
import * as request from "supertest";
import { Express, Application } from "express";

import {
    ScoutEvent,
    buildScoutConfiguration,
} from "../../lib/types";

import { setupRequireIntegrations } from "../../lib";

import {
    Scout,
    ScoutRequest,
    ScoutSpan,
    ScoutEventRequestSentData,
} from "../../lib/scout";

// The hook for http has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
// *NOTE* this must be here since express is used from TestUtil
setupRequireIntegrations(["express", "nuxt"]);

import * as TestUtil from "../util";
import * as Constants from "../../lib/constants";
import { getIntegrationSymbol } from "../../lib/types/integrations";
import ExpressIntegration from "../../lib/integrations/express";
import { scoutMiddleware, ApplicationWithScout } from "../../lib/express";

import { ScoutContextName, ScoutSpanOperation, ExpressFn } from "../../lib/types";

import { FILE_PATHS } from "../fixtures";

test("the shim works", t => {
    t.assert(getIntegrationSymbol() in require("nuxt"), "nuxt export has the integration symbol");
    t.end();
});

// https://github.com/scoutapp/scout_apm_node/issues/200
// TODO: find a way to test nuxt as a part of this without building the entire nuxt project?
