"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const TestUtil = require("../util");
const integrations_1 = require("../../lib/types/integrations");
const types_1 = require("../../lib/types");
const lib_1 = require("../../lib");
const scout_1 = require("../../lib/scout");
const types_2 = require("../../lib/types");
const fixtures_1 = require("../fixtures");
// The hook for ejs has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
lib_1.setupRequireIntegrations(["ejs"]);
// ejs needs to be imported this way to trigger the require integration
const ejs = require("ejs");
test("the shim works", t => {
    t.assert(integrations_1.getIntegrationSymbol() in ejs, "ejs export has the integration symbol");
    t.end();
});
test("ejs rendering a string is captured", t => {
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Set up a listener for the scout request that will contain the DB record
    const listener = (data) => {
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Look up the template render span from the request
        data.request
            .getChildSpans()
            .then(spans => {
            const renderSpan = spans.find(s => s.operation === types_2.ScoutSpanOperation.TemplateRender);
            t.assert(renderSpan, "template render span was present on request");
            if (!renderSpan) {
                t.fail("no render span present on request");
                throw new Error("No render span");
            }
            t.equals(renderSpan.getContextValue(types_2.ScoutContextName.Name), "<string>", "name tag is correct");
        })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Activate the listener
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Start a scout transaction & render a string
        .then(() => scout.transactionSync("Controller/ejs-render-string-test", () => {
        const rendered = ejs.render("<h1><%= 'test' %></h1>");
        t.equals(rendered, "<h1>test</h1>");
        const value = "value";
        const renderedInterpolation = ejs.render("<h1>value = <%= value %></h1>", { value });
        t.equals(renderedInterpolation, `<h1>value = ${value}</h1>`);
    }))
        // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
test("ejs rendering a file is captured", t => {
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Set up a listener for the scout request that will contain the DB record
    const listener = (data) => {
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Look up the database span from the request
        data.request
            .getChildSpans()
            .then(spans => {
            const renderSpan = spans.find(s => s.operation === types_2.ScoutSpanOperation.TemplateRender);
            t.assert(renderSpan, "template render span was present on request");
            if (!renderSpan) {
                t.fail("no render span present on request");
                throw new Error("No render span");
            }
            t.equals(renderSpan.getContextValue(types_2.ScoutContextName.Name), fixtures_1.FILE_PATHS.EJS_HTML5_BOILERPLATE, "name tag is correct");
        })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Activate the listener
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Start a scout transaction & render a string
        .then(() => scout.transaction("Controller/ejs-render-file-test", (finishTransaction, { request }) => {
        ejs.renderFile(fixtures_1.FILE_PATHS.EJS_HTML5_BOILERPLATE, { title: "dynamic" })
            .then(rendered => {
            t.assert(rendered, "file rendering completed");
            t.assert(rendered.includes("<title>dynamic</title>"), "dynamic title was rendered");
        })
            .then(() => finishTransaction());
    }))
        // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
