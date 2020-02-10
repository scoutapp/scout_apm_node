import * as test from "tape";
import * as TestUtil from "../util";
import * as Constants from "../../lib/constants";

import { getIntegrationSymbol } from "../../lib/types/integrations";
import {
    Scout,
    ScoutEvent,
    ScoutEventRequestSentData,
    ScoutRequest,
    buildScoutConfiguration,
    setupRequireIntegrations,
} from "../../lib";

import { ScoutContextName, ScoutSpanOperation } from "../../lib/types";

import { FILE_PATHS, MUSTACHE_TEMPLATES } from "../fixtures";
import * as Mustache from "mustache";

// The hook for mustache has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
setupRequireIntegrations(["mustache"]);

// mustache needs to be imported this way to trigger the require integration
const mustache = require("mustache");

test("the shim works", t => {
    t.assert(getIntegrationSymbol() in mustache, "mustache export has the integration symbol");
    t.end();
});

test("mustache rendering a string is captured", t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    const simple = MUSTACHE_TEMPLATES.HELLO_WORLD;
    const interpolated = MUSTACHE_TEMPLATES.HELLO_WORLD_INTERPOLATED;

    // Set up a listener for the scout request that will contain the DB record
    const listener = (data: ScoutEventRequestSentData) => {
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Look up the template render span from the request
        data.request
            .getChildSpans()
            .then(spans => {
                const renderSpans = spans.filter(s => s.operation === ScoutSpanOperation.TemplateRender);
                t.assert(renderSpans, "template render span was present on request");

                t.equals(renderSpans.length, 2, "two template spans were present");
                t.assert(
                    renderSpans.every(s => s.getContextValue(ScoutContextName.Name) === "<string>"),
                    "render spans had <string> as name context",
                );
            })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Activate the listener
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Start a scout transaction & render a string
        .then(() => scout.transactionSync("Controller/mustache-render-string-test", () => {
            const renderedSimple = Mustache.render(simple.template, {});
            t.equals(renderedSimple, "Hello world", "simple template is rendered properly");

            const renderedInterpolated = Mustache.render(interpolated.template, {name: "test"});
            t.equals(renderedInterpolated, "Hello test", "template with interpolation is rendered properly");
        }))
    // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
