import * as test from "tape";
import * as TestUtil from "./util";
import * as request from "supertest";

import { Application } from "express";
import { scoutMiddleware, ApplicationWithScout } from "../lib/express";
import { AgentEvent, buildScoutConfiguration, AgentRequest, AgentRequestType } from "../lib/types";
import { Scout } from "../lib/scout";
import { V1StartSpan } from "../lib/protocol/v1/requests";

test("Simple operation", t => {
    // Create an application and setup scout middleware
    const app: Application & ApplicationWithScout = TestUtil.simpleExpressApp(scoutMiddleware({
        config: buildScoutConfiguration({
            allowShutdown: true,
        }),
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }));

    let scout: Scout;

    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/")
        .expect("Content-Type", /json/)
        .expect(200)
        .then(res => {
            if (!app.scout) { throw new Error("Scout was not added to app object"); }

            t.assert(app.scout, "scout instance was added to the app object");
            t.assert(app.scout.hasAgent(), "the scout instance has an agent");
            scout = app.scout;
        })
    // Set up listeners and make another request to ensure that scout is working
        .then(() => {
            // Create a listener to watch for the request finished event
            const listener = () => {
                t.pass("received RequestFinished agent event");

                // Remove agent, pass test
                scout.getAgent()
                    .removeListener(AgentEvent.RequestFinished, listener);

                // Wait a little while for request to finish up, then shutdown
                TestUtil.waitMs(100)
                    .then(() => scout.shutdown())
                    .then(() => t.end())
                    .catch(t.end);
            };

            // Set up listener on the agent
            scout.getAgent()
                .on(AgentEvent.RequestFinished, listener);

            // Make another request to the application
            request(app)
                .get("/")
                .expect("Content-Type", /json/)
                .expect(200)
                .then(() => t.comment("sent second request"));
        })
        .catch(t.end);
});

test("Dynamic segment routes", t => {
    // Create an application and setup scout middleware
    const app: Application & ApplicationWithScout = TestUtil.simpleDynamicSegmentExpressApp(scoutMiddleware({
        config: buildScoutConfiguration({
            allowShutdown: true,
        }),
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }));

    let scout: Scout;
    const expectedRootSpan = "Controller/GET /dynamic/:segment";

    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/")
        .expect("Content-Type", /json/)
        .expect(200)
        .then(res => {
            if (!app.scout) { throw new Error("Scout was not added to app object"); }

            t.assert(app.scout, "scout instance was added to the app object");
            t.assert(app.scout.hasAgent(), "the scout instance has an agent");
            scout = app.scout;
        })
    // Set up listeners and make another request to ensure that scout is working
        .then(() => {
            // Create a listener to watch for the request finished event
            const listener = (message: AgentRequest) => {
                // Ignore requests that are sent that aren't span starts
                if (!message || message.type !== AgentRequestType.V1StartSpan) { return; }

                // Ensure that the span is what we expect
                t.equals((message as V1StartSpan).operation, expectedRootSpan, "root span operation is correct");

                // Remove agent, pass test
                scout.getAgent()
                    .removeListener(AgentEvent.RequestSent, listener);

                // Wait a little while for request to finish up, then shutdown
                TestUtil.waitMs(100)
                    .then(() => scout.shutdown())
                    .then(() => t.end())
                    .catch(t.end);
            };

            // Set up listener on the agent
            scout.getAgent()
                .on(AgentEvent.RequestSent, listener);

            // Make another request to the application
            request(app)
                .get("/dynamic/1234")
                .expect("Content-Type", /json/)
                .expect(200)
                .then(() => t.comment("sent second request"));
        })
        .catch(t.end);
});
