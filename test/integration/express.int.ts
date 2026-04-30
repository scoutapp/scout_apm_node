import test from "tape";
import request from "supertest";
import { Application } from "express";
import { MockAgent } from "./mock-agent";
import { scoutMiddleware, ApplicationWithScout } from "../../lib/express";
import { setupRequireIntegrations } from "../../lib";
import {
    AgentEvent,
    ScoutEvent,
    buildScoutConfiguration,
    ScoutSpanOperation,
} from "../../lib/types";
import { Scout, ScoutEventRequestSentData } from "../../lib/scout";
import * as TestUtil from "../util";

setupRequireIntegrations(["pug", "ejs", "mustache"]);

const TIMEOUT = 5000;

function buildScoutWithMock(mock: MockAgent, extra?: object) {
    return buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: mock.socketPath(),
        ...extra,
    });
}

test("Express GET / creates a Controller span", { timeout: TIMEOUT }, (t) => {
    const mock = new MockAgent();

    mock.start()
        .then(() => {
            const app: Application & ApplicationWithScout = TestUtil.simpleExpressApp(
                scoutMiddleware({
                    config: buildScoutWithMock(mock),
                    requestTimeoutMs: 0,
                    waitForScoutSetup: true,
                }),
            );

            return request(app).get("/").expect(200)
                .then(() => {
                    if (!app.scout) { throw new Error("scout not on app"); }
                    return app.scout;
                });
        })
        .then((scout: Scout) => {
            return new Promise<Scout>((resolve) => {
                scout.on(ScoutEvent.RequestSent, (data: ScoutEventRequestSentData) => {
                    const req = data.request;
                    const spans = req.getChildSpansSync();
                    const controllerSpan = spans.find((s) =>
                        s.operation.startsWith("Controller/"),
                    );

                    t.ok(controllerSpan, "Controller span was created");
                    t.ok(
                        controllerSpan && controllerSpan.operation.includes("GET"),
                        "Controller span includes HTTP method",
                    );
                    resolve(scout);
                });

                request(
                    (app as Application & ApplicationWithScout),
                ).get("/").end(() => undefined);
            });
        })
        .then((scout: Scout) => TestUtil.shutdownScout(t, scout))
        .then(() => mock.stop())
        .catch((err) => {
            mock.stop();
            t.fail(err.message);
            t.end();
        });
});

test("Express dynamic route captures route pattern", { timeout: TIMEOUT }, (t) => {
    const mock = new MockAgent();

    mock.start()
        .then(() => {
            const app: Application & ApplicationWithScout = TestUtil.simpleDynamicSegmentExpressApp(
                scoutMiddleware({
                    config: buildScoutWithMock(mock),
                    requestTimeoutMs: 0,
                    waitForScoutSetup: true,
                }),
            );

            return request(app).get("/").expect(200)
                .then(() => {
                    if (!app.scout) { throw new Error("scout not on app"); }
                    return app.scout;
                });
        })
        .then((scout: Scout) => {
            return new Promise<Scout>((resolve) => {
                scout.on(ScoutEvent.RequestSent, (data: ScoutEventRequestSentData) => {
                    const req = data.request;
                    const spans = req.getChildSpansSync();
                    const controllerSpan = spans.find((s) =>
                        s.operation.startsWith("Controller/"),
                    );

                    t.ok(controllerSpan, "Controller span present for dynamic route");
                    t.ok(
                        controllerSpan && controllerSpan.operation.includes(":segment"),
                        "Route pattern preserved (not the actual value)",
                    );
                    resolve(scout);
                });

                request(
                    (app as Application & ApplicationWithScout),
                ).get("/dynamic/hello").end(() => undefined);
            });
        })
        .then((scout: Scout) => TestUtil.shutdownScout(t, scout))
        .then(() => mock.stop())
        .catch((err) => {
            mock.stop();
            t.fail(err.message);
            t.end();
        });
});

test("Express error response is tagged on the span", { timeout: TIMEOUT }, (t) => {
    const mock = new MockAgent();

    mock.start()
        .then(() => {
            const app: Application & ApplicationWithScout = TestUtil.simpleErrorApp(
                scoutMiddleware({
                    config: buildScoutWithMock(mock),
                    requestTimeoutMs: 0,
                    waitForScoutSetup: true,
                }),
            );

            return request(app).get("/").then(() => {
                if (!app.scout) { throw new Error("scout not on app"); }
                return app.scout;
            });
        })
        .then((scout: Scout) => {
            return new Promise<Scout>((resolve) => {
                scout.on(ScoutEvent.RequestSent, (data: ScoutEventRequestSentData) => {
                    const req = data.request;
                    const errValue = req.getContextValue("error");

                    t.ok(errValue !== undefined, "error context set on request");
                    t.equal(errValue, "true", "error context value is 'true'");
                    resolve(scout);
                });

                request(
                    (app as Application & ApplicationWithScout),
                ).get("/").end(() => undefined);
            });
        })
        .then((scout: Scout) => TestUtil.shutdownScout(t, scout))
        .then(() => mock.stop())
        .catch((err) => {
            mock.stop();
            t.fail(err.message);
            t.end();
        });
});

test("Mock agent receives Register message on connect", { timeout: TIMEOUT }, (t) => {
    const mock = new MockAgent();

    mock.start()
        .then(() => {
            const app: Application & ApplicationWithScout = TestUtil.simpleExpressApp(
                scoutMiddleware({
                    config: buildScoutWithMock(mock, { name: "test-app", key: "test-key" }),
                    requestTimeoutMs: 0,
                    waitForScoutSetup: true,
                }),
            );

            return request(app).get("/").expect(200)
                .then(() => mock.waitForMessage("Register"));
        })
        .then((msg) => {
            t.ok(msg, "Register message received by mock agent");
            t.equal(msg.type, "Register", "message type is Register");
        })
        .then(() => mock.stop())
        .then(() => t.end())
        .catch((err) => {
            mock.stop();
            t.fail(err.message);
            t.end();
        });
});
