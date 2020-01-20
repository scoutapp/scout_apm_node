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

// The hook for pug has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
setupRequireIntegrations(["pug"]);

// pug needs to be imported this way to trigger the require integration
const pug = require("pug");

test("the shim works", t => {
    t.assert(scoutIntegrationSymbol in pug, "pug export has the integration symbol");
    t.end();
});
