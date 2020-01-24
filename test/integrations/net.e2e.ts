import {
    Scout,
    ScoutEvent,
    ScoutEventRequestSentData,
    ScoutRequest,
    buildScoutConfiguration,
    setupRequireIntegrations,
} from "../../lib";

// The hook for net has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
setupRequireIntegrations(["net"], );

// net needs to be imported this way to trigger the require integration
const net = require("net");

import * as test from "tape";
import * as request from "supertest";
import { Application } from "express";

import * as TestUtil from "../util";
import * as Constants from "../../lib/constants";
import { scoutIntegrationSymbol } from "../../lib/types/integrations";
import { scoutMiddleware, ApplicationWithScout } from "../../lib/express";

import { ScoutContextNames, ScoutSpanOperation } from "../../lib/types";

import { FILE_PATHS } from "../fixtures";

test("the shim works", t => {
    t.assert(scoutIntegrationSymbol in net, "net export has the integration symbol");
    t.end();
});

test("net connections are captured", t => {
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new Scout(config);

    const app: Application & ApplicationWithScout = TestUtil.simpleExpressApp(scoutMiddleware({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }));

    // Set up a listener for the scout request that will contain the DB record
    const listener = (data: ScoutEventRequestSentData) => {
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Look up the external request span from the request
        data.request
            .getChildSpans()
            .then(spans => {
                const requestSpan = spans.find(s => s.operation === ScoutSpanOperation.HTTPGet);
                t.assert(requestSpan, "external request span was present on request");
                if (!requestSpan) {
                    t.fail("no request span present on request");
                    throw new Error("No request span");
                }

                t.equals(
                    requestSpan.getContextValue(ScoutContextNames.URL),
                    "localhost:<some port>/path",
                    "url tag is correct",
                );
            })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Activate the listener
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Start a scout transaction & request a string
        .then(() => scout.transaction("Controller/external-request-test", (finishRequest) => {
            return finishRequest();
            // // Send a request to the application
            // return request(app)
            //     .get("/")
            //     .expect("Content-Type", /json/)
            //     .expect(200)
            //     .then(res => t.assert(res, "request sent"))
            //     .then(() => finishRequest());
        }))
    // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
