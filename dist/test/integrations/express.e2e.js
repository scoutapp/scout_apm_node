"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const request = require("supertest");
const lib_1 = require("../../lib");
// The hook for http has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
lib_1.setupRequireIntegrations(["express"]);
const TestUtil = require("../util");
const express_1 = require("../../lib/express");
const types_1 = require("../../lib/types");
// test("the shim works", t => {
//     t.assert(getIntegrationSymbol() in express, "express export has the integration symbol");
//     t.end();
// });
// https://github.com/scoutapp/scout_apm_node/issues/127
test("errors in controller functions trigger context updates", t => {
    const config = lib_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new lib_1.Scout(config);
    const app = TestUtil.expressAppWithGETControllerError(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 1000,
    }));
    // Set up a listener for the scout request that will be after timeout
    // we expect the scout middleware to timeout the request before express actually does
    // but before either of these timeouts happens, the unhandled exception in the handler
    // should trigger context updates
    const listener = (data) => {
        // Once we know we're looking at the right request, we can remove the listener
        scout.removeListener(lib_1.ScoutEvent.RequestSent, listener);
        // Find the context object that indicates an error occurred
        const errorCtx = data.request.getContextValue(types_1.ScoutContextName.Error);
        t.assert(errorCtx, "request had error context");
        // Find the context object that indicates an timeout occurred
        const timeoutCtx = data.request.getContextValue(types_1.ScoutContextName.Timeout);
        t.assert(timeoutCtx, "request had timeout context");
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Activate the listener
    scout.on(lib_1.ScoutEvent.RequestSent, listener);
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
