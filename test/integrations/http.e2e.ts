import * as test from "tape";
import * as request from "supertest";
import { Application } from "express";

import {
    Scout,
    ScoutEvent,
    ScoutEventRequestSentData,
    ScoutRequest,
    buildScoutConfiguration,
    setupRequireIntegrations,
} from "../../lib";

import * as TestUtil from "../util";
import * as Constants from "../../lib/constants";
import { getIntegrationSymbol } from "../../lib/types/integrations";
import { scoutMiddleware, ApplicationWithScout } from "../../lib/express";

import { ScoutContextName, ScoutSpanOperation } from "../../lib/types";

import { FILE_PATHS } from "../fixtures";

// The hook for http has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
setupRequireIntegrations(["http"]);

// http needs to be imported this way to trigger the require integration
const http = require("http");

test("the shim works", t => {
    t.assert(getIntegrationSymbol() in http, "http export has the integration symbol");
    t.end();
});

test("http connections are captured", t => {
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new Scout(config);

    const app: Application & ApplicationWithScout = TestUtil.simpleExpressApp(scoutMiddleware({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }));

    let expectedReqId: string;

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
    // Start a scout transaction & request a string
        .then(() => scout.transaction("Controller/external-request-test", (finishRequest, info) => {
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
