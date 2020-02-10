"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const request = require("supertest");
const lib_1 = require("../../lib");
const TestUtil = require("../util");
const integrations_1 = require("../../lib/types/integrations");
const express_1 = require("../../lib/express");
const types_1 = require("../../lib/types");
// The hook for http has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
lib_1.setupRequireIntegrations(["http"]);
// http needs to be imported this way to trigger the require integration
const http = require("http");
test("the shim works", t => {
    t.assert(integrations_1.getIntegrationSymbol() in http, "http export has the integration symbol");
    t.end();
});
test("http connections are captured", t => {
    const config = lib_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new lib_1.Scout(config);
    const app = TestUtil.simpleExpressApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
    }));
    let expectedReqId;
    // Set up a listener for the scout request that will contain the DB record
    const listener = (data) => {
        if (data.request.id !== expectedReqId) {
            return;
        }
        // Once we know we're looking at the right request, we can remove the listener
        scout.removeListener(lib_1.ScoutEvent.RequestSent, listener);
        // Look up the external request span from the request
        data.request
            .getChildSpans()
            .then(spans => {
            const requestSpan = spans.find(s => s.operation === types_1.ScoutSpanOperation.HTTPGet);
            t.assert(requestSpan, "external request span was present on request");
            if (!requestSpan) {
                t.fail("no external request span present on request");
                throw new Error("No external request span");
            }
            // Since we don't know what port superagent will assign the request we just check if it's there
            const urlTag = requestSpan.getContextValue(types_1.ScoutContextName.URL);
            t.assert(urlTag, `url tag is present [${urlTag}]`);
        })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Activate the listener
    scout.on(lib_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Start a scout transaction & request a string
        .then(() => scout.transaction("Controller/external-request-test", (finishRequest, info) => {
        // Record the expected request ID so we can look for it in the listener
        if (!info || !info.request) {
            throw new Error("Request not present on transaction start");
        }
        expectedReqId = info.request.id;
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
