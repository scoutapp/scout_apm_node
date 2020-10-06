import * as test from "tape";
import * as request from "supertest";
import { Express, Application } from "express";
import { generate as generateRandomString } from "randomstring";

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

// The hook for http has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
// *NOTE* this must be here since express is used from TestUtil
setupRequireIntegrations(["express"]);

import * as TestUtil from "../util";
import * as Constants from "../../lib/constants";
import { getIntegrationSymbol } from "../../lib/types/integrations";
import ExpressIntegration from "../../lib/integrations/express";
import { scoutMiddleware, ApplicationWithScout } from "../../lib/express";

import { ScoutContextName, ScoutSpanOperation, ExpressFn } from "../../lib/types";

import { FILE_PATHS } from "../fixtures";

test("the shim works", t => {
    t.assert(getIntegrationSymbol() in require("express"), "express export has the integration symbol");
    t.end();
});

test("express object still has native props", t => {
    const express = require("express");
    t.assert("static" in express, "express.static is still present");
    t.end();
});

// https://github.com/scoutapp/scout_apm_node/issues/127
test("errors in controller functions trigger context updates", t => {
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new Scout(config);

    const app: Application & ApplicationWithScout = TestUtil.appWithGETSynchronousError(
        scoutMiddleware({
            scout,
            requestTimeoutMs: 0, // disable request timeout to stop test from hanging
        }),
        (fn: ExpressFn) => ExpressIntegration.shimExpressFn(fn),
    );

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

// https://github.com/scoutapp/scout_apm_node/issues/238
test("express Routers are recorded (one level)", t => {
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new Scout(config);

    const app: Application & ApplicationWithScout = TestUtil.appWithRouterGET(
        scoutMiddleware({
            scout,
            requestTimeoutMs: 0, // disable request timeout to stop test from hanging
        }),
        (fn: ExpressFn) => ExpressIntegration.shimExpressFn(fn),
    );

    // Create a name to use the echo router
    const reqName = generateRandomString(5);

    // Set up a listener for the scout request that will be after the Router-hosted GET is hit
    const listener = (data: ScoutEventRequestSentData) => {
        if (!data || !data.request) { return; }

        // Ensure there the top level span is what we expect
        const spans = data.request.getChildSpansSync();
        if (!spans || spans.length <= 0) { return; }

        const topLevelSpan = spans[0];
        // Ensure that the top level span is a Controller span
        // (ex. a HTTP/GET span/request will also come through b/c supertest makes a request)
        if (!topLevelSpan.operation.startsWith("Controller")) { return; }

        // Ensure that path matches the full path of router
        t.equals(
            topLevelSpan.operation,
            "Controller/GET /mounted/echo/:name",
            "path matches combined dynamic path to router function",
        );

        t.equals(
            data.request.getContextValue(ScoutContextName.Path),
            `/mounted/echo/${reqName}`,
            "tagged URL matches the expected URL",
        );

        // Once we know we're looking at the right request, we can remove the listener
        scout.removeListener(ScoutEvent.RequestSent, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Activate the listener
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Send a request to trigger the controller-function error
        .then(() => {
            const url = `/mounted/echo/${reqName}`;
            t.comment(`sending request to [${url}]`);

            return request(app)
                .get(url)
                .expect("Content-Type", /json/)
                .expect(200)
                .then(res => t.assert(res, "request sent"));
        })
    // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/238
test("express Routers are recorded (two levels)", t => {
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new Scout(config);

    const app: Application & ApplicationWithScout = TestUtil.appWithRouterGET(
        scoutMiddleware({
            scout,
            requestTimeoutMs: 0, // disable request timeout to stop test from hanging
        }),
        (fn: ExpressFn) => ExpressIntegration.shimExpressFn(fn),
    );

    // Create a name to use the echo router
    const reqName = generateRandomString(5);

    // Set up a listener for the scout request that will be after the Router-hosted GET is hit
    const listener = (data: ScoutEventRequestSentData) => {
        if (!data || !data.request) { return; }

        // Ensure there the top level span is what we expect
        const spans = data.request.getChildSpansSync();
        if (!spans || spans.length <= 0) { return; }

        const topLevelSpan = spans[0];
        // Ensure that the top level span is a Controller span
        // (ex. a HTTP/GET span/request will also come through b/c supertest makes a request)
        if (!topLevelSpan.operation.startsWith("Controller")) { return; }

        // Ensure that path matches the full path of router
        t.equals(
            topLevelSpan.operation,
            "Controller/GET /mounted/level-2/echo/:name",
            "path matches combined dynamic path to router function",
        );

        t.equals(
            data.request.getContextValue(ScoutContextName.Path),
            `/mounted/level-2/echo/${reqName}`,
            "tagged URL matches the expected URL",
        );

        // Once we know we're looking at the right request, we can remove the listener
        scout.removeListener(ScoutEvent.RequestSent, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Activate the listener
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Send a request to trigger the controller-function error
        .then(() => {
            const url = `/mounted/level-2/echo/${reqName}`;
            t.comment(`sending request to [${url}]`);

            return request(app)
                .get(url)
                .expect("Content-Type", /json/)
                .expect(200)
                .then(res => t.assert(res, "request sent"));
        })
    // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
