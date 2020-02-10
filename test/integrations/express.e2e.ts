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

// The hook for http has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
// *NOTE* this must be here since express is used from TestUtil
setupRequireIntegrations(["express"]);

import * as TestUtil from "../util";
import * as Constants from "../../lib/constants";
import { getIntegrationSymbol } from "../../lib/types/integrations";
import { scoutMiddleware, ApplicationWithScout } from "../../lib/express";

import { ScoutContextName, ScoutSpanOperation } from "../../lib/types";

import { FILE_PATHS } from "../fixtures";

test("the shim works", t => {
    t.assert(getIntegrationSymbol() in require("express"), "express export has the integration symbol");
    t.end();
});

// https://github.com/scoutapp/scout_apm_node/issues/127
test("errors in controller functions trigger context updates", t => {
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new Scout(config);

    const app: Application & ApplicationWithScout = TestUtil.appWithGETSynchronousError(scoutMiddleware({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }));

    // Set up a listener for the scout request that will be after the controller error is thrown
    // Express should catch the error (https://expressjs.com/en/guide/error-handling.html)
    // and terminate the request automatically
    const listener = (data: ScoutEventRequestSentData) => {
        // Once we know we're looking at the right request, we can remove the listener
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Find the context object that indicates an error occurred
        const errorCtx = data.request.getContextValue(ScoutContextName.Error);
        t.assert(errorCtx, "request had error context");

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Activate the listener
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Send a request to trigger the controller-function error
        .then(() => {
            return request(app)
                .get("/")
                .expect("Content-Type", /html/)
                .expect(500)
                .then(res => t.assert(res, "request sent"));
        })
    // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
