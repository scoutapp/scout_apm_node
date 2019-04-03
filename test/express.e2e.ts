import * as test from "tape";
import * as TestUtil from "./util";
import * as request from "supertest"

import { Application } from "express";
import { scoutMiddleware, ApplicationWithScout } from "../lib/express";
import { AgentEvent } from "../lib/types";
import { Scout } from "../lib/scout";

test("Simple operation", t => {
    // Create an application and setup scout middleware
    const app: Application & ApplicationWithScout = TestUtil.simpleExpressApp();
    app.use(scoutMiddleware());

    let scout: Scout;

    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/")
        .expect('Content-Type', /json/)
        .expect(200)
        .then(res => {
            console.log("res.body?", res.body);
            if (!app.scout) { throw new Error("Scout was not added to app object"); }

            t.assert(app.scout, "scout instance was added to the app object");
            t.assert(app.scout.hasAgent(), "the scout instance has an agent");
            scout = app.scout;
        })
    // Set up listeners and make another request to ensure that scout is working
        .then(() => {
            // Create a listener to watch for the request finished event
            const listener = (event: string) => {
                console.log("received event:", event);
                if (event != AgentEvent.RequestFinished) { return; }

                scout.getAgent().removeListener(AgentEvent.RequestFinished, listener);
                t.pass("received RequestFinished agent event");
                t.end();
            }

            // Set up listener on the agent
            scout.getAgent()
                .on(AgentEvent.RequestFinished, listener);

            // Make another request to the application
            request(app).get("/");
        })
        .catch(t.end);
});
