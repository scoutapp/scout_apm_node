"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tape_1 = __importDefault(require("tape"));
const supertest_1 = __importDefault(require("supertest"));
const randomstring_1 = require("randomstring");
const types_1 = require("../../lib/types");
const lib_1 = require("../../lib");
const scout_1 = require("../../lib/scout");
// The hook for http has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
// *NOTE* this must be here since express is used from TestUtil
(0, lib_1.setupRequireIntegrations)(["express"]);
const TestUtil = __importStar(require("../util"));
const integrations_1 = require("../../lib/types/integrations");
const express_1 = __importDefault(require("../../lib/integrations/express"));
const express_2 = require("../../lib/express");
const types_2 = require("../../lib/types");
(0, tape_1.default)("the shim works", t => {
    t.assert((0, integrations_1.getIntegrationSymbol)() in require("express"), "express export has the integration symbol");
    t.end();
});
(0, tape_1.default)("express object still has native props", t => {
    const express = require("express");
    t.assert("static" in express, "express.static is still present");
    t.end();
});
// https://github.com/scoutapp/scout_apm_node/issues/127
(0, tape_1.default)("errors in controller functions trigger context updates", t => {
    const config = (0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new scout_1.Scout(config);
    const app = TestUtil.appWithGETSynchronousError((0, express_2.scoutMiddleware)({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
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
        return (0, supertest_1.default)(app)
            .get("/")
            .expect("Content-Type", /html/)
            .expect(500)
            .then(res => t.assert(res, "request sent"));
    })
        // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// https://github.com/scoutapp/scout_apm_node/issues/238
(0, tape_1.default)("express Routers are recorded (one level)", t => {
    const config = (0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new scout_1.Scout(config);
    const app = TestUtil.appWithRouterGET((0, express_2.scoutMiddleware)({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }), (fn) => express_1.default.shimExpressFn(fn));
    // Create a name to use the echo router
    const reqName = (0, randomstring_1.generate)(5);
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
        t.equals(data.request.getContextValue(types_2.ScoutContextName.Path), `/mounted/echo/${reqName}`, "tagged URL matches the expected URL");
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
        return (0, supertest_1.default)(app)
            .get(url)
            .expect("Content-Type", /json/)
            .expect(200)
            .then(res => t.assert(res, "request sent"));
    })
        // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// https://github.com/scoutapp/scout_apm_node/issues/238
(0, tape_1.default)("express Routers are recorded (two levels)", t => {
    const config = (0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new scout_1.Scout(config);
    const app = TestUtil.appWithRouterGET((0, express_2.scoutMiddleware)({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }), (fn) => express_1.default.shimExpressFn(fn));
    // Create a name to use the echo router
    const reqName = (0, randomstring_1.generate)(5);
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
        t.equals(topLevelSpan.operation, "Controller/GET /mounted/level-2/echo/:name", "path matches combined dynamic path to router function");
        t.equals(data.request.getContextValue(types_2.ScoutContextName.Path), `/mounted/level-2/echo/${reqName}`, "tagged URL matches the expected URL");
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
        const url = `/mounted/level-2/echo/${reqName}`;
        t.comment(`sending request to [${url}]`);
        return (0, supertest_1.default)(app)
            .get(url)
            .expect("Content-Type", /json/)
            .expect(200)
            .then(res => t.assert(res, "request sent"));
    })
        // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
