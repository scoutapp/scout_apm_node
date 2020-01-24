"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const request = require("supertest");
const TestUtil = require("../util");
const integrations_1 = require("../../lib/types/integrations");
const express_1 = require("../../lib/express");
const lib_1 = require("../../lib");
const types_1 = require("../../lib/types");
// The hook for net has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
lib_1.setupRequireIntegrations(["net"]);
// net needs to be imported this way to trigger the require integration
const net = require("net");
test("the shim works", t => {
    t.assert(integrations_1.scoutIntegrationSymbol in net, "net export has the integration symbol");
    t.end();
});
test("net connections are captured", t => {
    const config = lib_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new lib_1.Scout(config);
    const app = TestUtil.simpleExpressApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
    }));
    // Set up a listener for the scout request that will contain the DB record
    const listener = (data) => {
        scout.removeListener(lib_1.ScoutEvent.RequestSent, listener);
        // Look up the external request span from the request
        data.request
            .getChildSpans()
            .then(spans => {
            const requestSpan = spans.find(s => s.operation === types_1.ScoutSpanOperation.HTTPGet);
            t.assert(requestSpan, "external request span was present on request");
            if (!requestSpan) {
                t.fail("no request span present on request");
                throw new Error("No request span");
            }
            t.equals(requestSpan.getContextValue(types_1.ScoutContextNames.URL), "localhost:<some port>/path", "url tag is correct");
        })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Activate the listener
    scout.on(lib_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Start a scout transaction & request a string
        .then(() => scout.transaction("Controller/external-request-test", (finishRequest) => {
        // Send a request to the application
        return request(app)
            .get("/")
            .expect("Content-Type", /json/)
            .expect(200)
            .then(res => t.assert(res, "request sent"))
            .then(() => finishRequest());
    }))
        // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
