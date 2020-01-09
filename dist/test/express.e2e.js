"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const TestUtil = require("./util");
const request = require("supertest");
const express_1 = require("../lib/express");
const types_1 = require("../lib/types");
test("Simple operation", t => {
    // Create an application and setup scout middleware
    const app = TestUtil.simpleExpressApp(express_1.scoutMiddleware({
        config: types_1.buildScoutConfiguration({
            allowShutdown: true,
            monitor: true,
        }),
        requestTimeoutMs: 0,
    }));
    let scout;
    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/")
        .expect("Content-Type", /json/)
        .expect(200)
        .then(res => {
        if (!app.scout) {
            throw new Error("Scout was not added to app object");
        }
        t.assert(app.scout, "scout instance was added to the app object");
        t.assert(app.scout.hasAgent(), "the scout instance has an agent");
        scout = app.scout;
    })
        // Set up listeners and make another request to ensure that scout is working
        .then(() => {
        // Create a listener to watch for the request finished event
        const listener = () => {
            t.pass("received RequestFinished agent event");
            // Remove listener
            scout.removeListener(types_1.AgentEvent.RequestFinished, listener);
            // Wait a little while for request to finish up, then shutdown
            TestUtil.waitMs(100)
                .then(() => TestUtil.shutdownScout(t, scout))
                .catch(err => TestUtil.shutdownScout(t, scout, err));
        };
        // Set up listener on the agent
        scout.on(types_1.AgentEvent.RequestFinished, listener);
        // Make another request to the application
        request(app)
            .get("/")
            .expect("Content-Type", /json/)
            .expect(200)
            .then(() => t.comment("sent second request"));
    })
        .catch(t.end);
});
test("Dynamic segment routes", { timeout: TestUtil.EXPRESS_TEST_TIMEOUT }, t => {
    // Create an application and setup scout middleware
    const app = TestUtil.simpleDynamicSegmentExpressApp(express_1.scoutMiddleware({
        config: types_1.buildScoutConfiguration({
            allowShutdown: true,
            monitor: true,
        }),
        requestTimeoutMs: 0,
    }));
    let scout;
    const expectedRootSpan = "Controller/GET /dynamic/:segment";
    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/")
        .expect("Content-Type", /json/)
        .expect(200)
        .then(res => {
        if (!app.scout) {
            throw new Error("Scout was not added to app object");
        }
        t.assert(app.scout, "scout instance was added to the app object");
        t.assert(app.scout.hasAgent(), "the scout instance has an agent");
        scout = app.scout;
    })
        // Set up listeners and make another request to ensure that scout is working
        .then(() => {
        // Create a listener to watch for the request finished event
        const listener = (message) => {
            // Ignore requests that are sent that aren't span starts
            if (!message || message.type !== types_1.AgentRequestType.V1StartSpan) {
                return;
            }
            // Skip requests that aren't the span we expect ( the initial GET / will trigger this)
            const msg = message;
            if (msg.operation !== expectedRootSpan) {
                return;
            }
            // Ensure that the span is what we expect
            t.equals(msg.operation, expectedRootSpan, `root span operation is correct [${msg.operation}]`);
            // Remove agent, pass test
            scout.removeListener(types_1.AgentEvent.RequestSent, listener);
            // Wait a little while for request to finish up, then shutdown
            TestUtil.waitMs(100)
                .then(() => TestUtil.shutdownScout(t, scout))
                .catch(err => TestUtil.shutdownScout(t, scout, err));
        };
        // Set up listener on the agent
        scout.on(types_1.AgentEvent.RequestSent, listener);
        // Make another request to the application
        request(app)
            .get("/dynamic/1234")
            .expect("Content-Type", /json/)
            .expect(200)
            .then(() => t.comment("sent second request"));
    })
        .catch(t.end);
});
test("Application which errors", { timeout: TestUtil.EXPRESS_TEST_TIMEOUT }, t => {
    // Create an application and setup scout middleware
    const app = TestUtil.simpleErrorApp(express_1.scoutMiddleware({
        config: types_1.buildScoutConfiguration({
            allowShutdown: true,
            monitor: true,
        }),
        requestTimeoutMs: 0,
    }));
    let scout;
    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/")
        .expect(500)
        .then(res => {
        if (!app.scout) {
            throw new Error("Scout was not added to app object");
        }
        t.assert(app.scout, "scout instance was added to the app object");
        t.assert(app.scout.hasAgent(), "the scout instance has an agent");
        scout = app.scout;
    })
        .then(() => scout.shutdown())
        .then(() => t.end())
        .catch(t.end);
});
