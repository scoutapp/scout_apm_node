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

import { FILE_PATHS } from "../fixtures";

// The hook for ejs has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
setupRequireIntegrations(["ejs"]);

// ejs needs to be imported this way to trigger the require integration
const ejs = require("ejs");

test("the shim works", t => {
    t.assert(getIntegrationSymbol() in ejs, "ejs export has the integration symbol");
    t.end();
});

test("ejs rendering a string is captured", t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    // Set up a listener for the scout request that will contain the DB record
    const listener = (data: ScoutEventRequestSentData) => {
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Look up the template render span from the request
        data.request
            .getChildSpans()
            .then(spans => {
                const renderSpan = spans.find(s => s.operation === ScoutSpanOperation.TemplateRender);
                t.assert(renderSpan, "template render span was present on request");
                if (!renderSpan) {
                    t.fail("no render span present on request");
                    throw new Error("No render span");
                }

                t.equals(
                    renderSpan.getContextValue(ScoutContextName.Name),
                    "<string>",
                    "name tag is correct",
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
        .then(() => scout.transactionSync("Controller/ejs-render-string-test", () => {
            const rendered = ejs.render("<h1><%= 'test' %></h1>");
            t.equals(rendered, "<h1>test</h1>");

            const value = "value";
            const renderedInterpolation = ejs.render("<h1>value = <%= value %></h1>", {value});
            t.equals(renderedInterpolation, `<h1>value = ${value}</h1>`);
        }))
    // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("ejs rendering a file is captured", t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    // Set up a listener for the scout request that will contain the DB record
    const listener = (data: ScoutEventRequestSentData) => {
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Look up the database span from the request
        data.request
            .getChildSpans()
            .then(spans => {
                const renderSpan = spans.find(s => s.operation === ScoutSpanOperation.TemplateRender);
                t.assert(renderSpan, "template render span was present on request");
                if (!renderSpan) {
                    t.fail("no render span present on request");
                    throw new Error("No render span");
                }

                t.equals(
                    renderSpan.getContextValue(ScoutContextName.Name),
                    FILE_PATHS.EJS_HTML5_BOILERPLATE,
                    "name tag is correct",
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
        .then(() => scout.transaction("Controller/ejs-render-file-test", (finishTransaction, {request}) => {
            ejs.renderFile(FILE_PATHS.EJS_HTML5_BOILERPLATE, {title: "dynamic"})
                .then(rendered => {
                    t.assert(rendered, "file rendering completed");
                    t.assert(rendered.includes("<title>dynamic</title>"), "dynamic title was rendered");
                })
                .then(() => finishTransaction());
        }))
    // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
