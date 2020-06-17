"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const request = require("supertest");
const types_1 = require("../../lib/types");
const lib_1 = require("../../lib");
const scout_1 = require("../../lib/scout");
const TestUtil = require("../util");
const integrations_1 = require("../../lib/types/integrations");
const express_1 = require("../../lib/express");
const types_2 = require("../../lib/types");
// The hook for https has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
lib_1.setupRequireIntegrations(["https"]);
const https = require("https");
test("the shim works", t => {
    t.assert(integrations_1.getIntegrationSymbol() in https, "https export has the integration symbol");
    t.end();
});
test("https.get triggers proper span creation", t => {
    const config = types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new scout_1.Scout(config);
    let expectedReqId;
    const url = "https://www.scoutapm.com";
    // Set up a listener for the scout request that will contain the DB record
    const listener = (data) => {
        if (data.request.id !== expectedReqId) {
            return;
        }
        // Once we know we're looking at the right request, we can remove the listener
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Look up the external request span from the request
        data.request
            .getChildSpans()
            .then(spans => {
            const requestSpan = spans.find(s => s.operation === types_2.ScoutSpanOperation.HTTPGet);
            t.assert(requestSpan, "external request span was present on request");
            if (!requestSpan) {
                t.fail("no external request span present on request");
                throw new Error("No external request span");
            }
            // Since we don't know what port superagent will assign the request we just check if it's there
            const urlTag = requestSpan.getContextValue(types_2.ScoutContextName.URL);
            t.assert(urlTag, `url tag is present [${urlTag}]`);
        })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Activate the listener
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Start a scout transaction
        .then(() => scout.transaction("Controller/external-https-request-test", (finishRequest, info) => {
        // Record the expected request ID so we can look for it in the listener
        if (!info || !info.request) {
            throw new Error("Request not present on transaction start");
        }
        expectedReqId = info.request.id;
        // Send a request to the application
        https.get(url, (res) => {
            t.assert(res, "request sent");
            finishRequest();
        });
    }))
        // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// https://github.com/scoutapp/scout_apm_node/issues/209
test("An endpoint using http-proxy-middleware should capture proxied requests", t => {
    const config = types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new scout_1.Scout(config);
    // The URL we will proxy to
    const proxyTarget = "https://www.scoutapm.com";
    const app = TestUtil.appWithHTTPProxyMiddleware(
    // we disable request timeout to stop test from hanging
    express_1.scoutMiddleware({ scout, requestTimeoutMs: 0 }), proxyTarget);
    let expectedReqId;
    // Set up a listener for the scout request that will contain the DB record
    const listener = (data) => {
        // The first request should be the GET /
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Look up the top level Controller span
        const requestSpans = data.request.getChildSpansSync();
        const rootSpan = requestSpans.find(s => s.operation.includes("Controller/GET /"));
        if (!rootSpan) {
            throw new Error("No controller span");
        }
        // Look up the HTTP get span
        const childSpans = rootSpan.getChildSpansSync();
        const httpSpan = childSpans.find(s => s.operation.includes("HTTP/GET"));
        if (!httpSpan) {
            throw new Error("No HTTP span");
        }
        const urlTag = httpSpan.getContextValue(types_2.ScoutContextName.URL);
        t.assert(urlTag, `url tag is present [${urlTag}]`);
        // NOTE: the "path" is / (the root), so the proxyTarget must be added to
        t.equals(urlTag, `${proxyTarget}/`, "the url tag has the right value");
        // Shutdown
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Activate the listener
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Start a scout transaction & request a string
        .then(() => scout.transaction("Controller/external-https-proxy-test", (finishRequest, info) => {
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
