"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const request = require("supertest");
const randomstring_1 = require("randomstring");
const types_1 = require("../../lib/types");
const lib_1 = require("../../lib");
const scout_1 = require("../../lib/scout");
// The hook for http has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
// *NOTE* this must be here since express is used from TestUtil
lib_1.setupRequireIntegrations(["express"]);
const TestUtil = require("../util");
const integrations_1 = require("../../lib/types/integrations");
const express_1 = require("../../lib/integrations/express");
const express_2 = require("../../lib/express");
const types_2 = require("../../lib/types");
test("the shim works", t => {
    t.assert(integrations_1.getIntegrationSymbol() in require("express"), "express export has the integration symbol");
    t.end();
});
test("express object still has native props", t => {
    const express = require("express");
    t.assert("static" in express, "express.static is still present");
    t.end();
});
// https://github.com/scoutapp/scout_apm_node/issues/127
test("errors in controller functions trigger context updates", t => {
    const config = types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new scout_1.Scout(config);
    const app = TestUtil.appWithGETSynchronousError(express_2.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
    }), (fn) => express_1.default.shimExpressFn(fn));
    // Set up a listener for the scout request that will be after the controller error is thrown
    // Express should catch the error (https://expressjs.com/en/guide/error-handling.html)
    // and terminate the request automatically
    const listener = (data) => {
        // Once we know we're looking at the right request, we can remove the listener
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Find the context object that indicates an error occurred
        const errorCtx = data.request.getContextValue(types_2.ScoutContextName.Error);
        t.assert(errorCtx, "request had error context");
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Activate the listener
    scout.on(types_1.ScoutEvent.RequestSent, listener);
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
test("express Routers are recorded", t => {
    const config = types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new scout_1.Scout(config);
    const app = TestUtil.appWithRouterGET(express_2.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
    }), (fn) => express_1.default.shimExpressFn(fn));
    // Create a name to use the echo router
    const reqName = randomstring_1.generate(5);
    // Set up a listener for the scout request that will be after the Router-hosted GET is hit
    const listener = (data) => {
        if (!data || !data.request) {
            return;
        }
        // Ensure there the top level span is what we expect
        const spans = data.request.getChildSpansSync();
        if (!spans || spans.length <= 0) {
            return;
        }
        const topLevelSpan = spans[0];
        // Ensure that the top level span is a Controller span
        // (ex. a HTTP/GET span/request will also come through b/c supertest makes a request)
        if (!topLevelSpan.operation.startsWith("Controller")) {
            return;
        }
        // Ensure that path matches the full path of router
        t.equals(topLevelSpan.operation, "Controller/GET /mounted/echo/:name", "path matches combined dynamic path to router function");
        // Once we know we're looking at the right request, we can remove the listener
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Activate the listener
    scout.on(types_1.ScoutEvent.RequestSent, listener);
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
