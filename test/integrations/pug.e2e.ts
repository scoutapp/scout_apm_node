import * as test from "tape";
import * as TestUtil from "../util";
import * as Constants from "../../lib/constants";

import { scoutIntegrationSymbol } from "../../lib/types/integrations";
import {
    Scout,
    ScoutEvent,
    ScoutEventRequestSentData,
    ScoutRequest,
    buildScoutConfiguration,
    setupRequireIntegrations,
} from "../../lib";

import { ScoutContextNames } from "../../lib/types";
import { SQL_QUERIES } from "../fixtures";

// The hook for pug has to be triggered this way in a typescript context
// since a partial import like { Client } will not trigger a require
const pug = require("pug");

test("the shim works", t => {
    t.assert(scoutIntegrationSymbol in pug, "pug export has the integration symbol");
    t.end();
});
