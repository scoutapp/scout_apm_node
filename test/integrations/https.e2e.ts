import * as test from "tape";
import * as request from "supertest";
import { Application } from "express";

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

import * as TestUtil from "../util";
import * as Constants from "../../lib/constants";
import { getIntegrationSymbol } from "../../lib/types/integrations";
import { scoutMiddleware, ApplicationWithScout } from "../../lib/express";

import { ScoutContextName, ScoutSpanOperation } from "../../lib/types";

import { FILE_PATHS } from "../fixtures";

// The hook for https has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
setupRequireIntegrations(["https"]);

const https = require("https");

test("the shim works", t => {
    t.assert(getIntegrationSymbol() in https, "https export has the integration symbol");
    t.end();
});

test("https.get triggers proper span creation", t => {
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new Scout(config);

    let expectedReqId: string;
    const url = "https://www.scoutapm.com";

    // Set up a listener for the scout request that will contain the DB record
    const listener = (data: ScoutEventRequestSentData) => {
        if (data.request.id !== expectedReqId)  { return; }

        // Once we know we're looking at the right request, we can remove the listener
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Look up the external request span from the request
        data.request
            .getChildSpans()
            .then(spans => {
                const requestSpan = spans.find(s => s.operation === ScoutSpanOperation.HTTPGet);
                t.assert(requestSpan, "external request span was present on request");
                if (!requestSpan) {
                    t.fail("no external request span present on request");
                    throw new Error("No external request span");
                }

                // Since we don't know what port superagent will assign the request we just check if it's there
                const urlTag = requestSpan.getContextValue(ScoutContextName.URL);
                t.assert(urlTag, `url tag is present [${urlTag}]`);
            })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Activate the listener
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Start a scout transaction
        .then(() => scout.transaction("Controller/external-https-request-test", (finishRequest, info) => {
            // Record the expected request ID so we can look for it in the listener
            if (!info || !info.request) { throw new Error("Request not present on transaction start"); }

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
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new Scout(config);

    // The URL we will proxy to
    const proxyTarget = "https://www.scoutapm.com";

    const app: Application & ApplicationWithScout = TestUtil.appWithHTTPProxyMiddleware(
        // we disable request timeout to stop test from hanging
        scoutMiddleware({scout, requestTimeoutMs: 0}),
        proxyTarget,
    );

    let expectedReqId: string;

    // Set up a listener for the scout request that will contain the DB record
    const listener = (data: ScoutEventRequestSentData) => {
        // The first request should be the GET /
        scout.removeListener(ScoutEvent.RequestSent, listener);

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

        const urlTag = httpSpan.getContextValue(ScoutContextName.URL);
        t.assert(urlTag, `url tag is present [${urlTag}]`);
        // NOTE: the "path" is / (the root), so the proxyTarget must be added to
        t.equals(urlTag, `${proxyTarget}/`, "the url tag has the right value");

        // Shutdown
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Activate the listener
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Start a scout transaction & request a string
        .then(() => scout.transaction("Controller/external-https-proxy-test", (finishRequest, info) => {
            // Record the expected request ID so we can look for it in the listener
            if (!info || !info.request) { throw new Error("Request not present on transaction start"); }

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
