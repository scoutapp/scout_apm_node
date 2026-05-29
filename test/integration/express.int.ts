import * as test from "tape";
import * as request from "supertest";
import { Application } from "express";
import { MockAgent } from "./mock-agent";
import { scoutMiddleware, ApplicationWithScout } from "../../lib/express";
import { setupRequireIntegrations } from "../../lib";
import {
    ScoutEvent,
    buildScoutConfiguration,
} from "../../lib/types";
import { Scout, ScoutEventRequestSentData } from "../../lib/scout";
import * as TestUtil from "../util";

setupRequireIntegrations(["pug", "ejs", "mustache"]);

const TIMEOUT = 15000;

type AppWithScout = Application & ApplicationWithScout;

function buildScoutWithMock(mock: MockAgent, extra?: object) {
    return buildScoutConfiguration({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: mock.socketPath(),
        ...extra,
    });
}

function nextRequestSent(scout: Scout): Promise<ScoutEventRequestSentData> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            scout.removeListener(ScoutEvent.RequestSent, listener);
            reject(new Error("Timed out waiting for ScoutEvent.RequestSent"));
        }, TIMEOUT - 2000);

        const listener = (data: ScoutEventRequestSentData) => {
            if (!data.request.getChildSpansSync().some((s) => s.operation.startsWith("Controller/"))) {
                return;
            }
            clearTimeout(timer);
            scout.removeListener(ScoutEvent.RequestSent, listener);
            resolve(data);
        };

        scout.on(ScoutEvent.RequestSent, listener);
    });
}

function makeApp(scout: Scout, factory: (mw: any) => Application): AppWithScout {
    return factory(
        scoutMiddleware({
            scout,
            requestTimeoutMs: 0,
            waitForScoutSetup: true,
        }),
    ) as AppWithScout;
}

test("Express GET / creates a Controller span", { timeout: TIMEOUT }, (t) => {
    const mock = new MockAgent();
    let scout: Scout;

    mock.start()
        .then(() => {
            scout = new Scout(buildScoutWithMock(mock));
            return scout.setup();
        })
        .then(() => {
            const app = makeApp(scout, (mw) => TestUtil.simpleExpressApp(mw));
            const sentPromise = nextRequestSent(scout);
            request(app).get("/").end(() => undefined);
            return sentPromise;
        })
        .then((data) => {
            const spans = data.request.getChildSpansSync();
            const controllerSpan = spans.find((s) => s.operation.startsWith("Controller/"));

            t.ok(controllerSpan, "Controller span was created");
            t.ok(
                controllerSpan && controllerSpan.operation.includes("GET"),
                "Controller span includes HTTP method",
            );
            return TestUtil.shutdownScout(t, scout);
        })
        .then(() => mock.stop())
        .catch((err) => {
            mock.stop().catch(() => undefined);
            t.fail(err.message);
            t.end();
        });
});

test("Express dynamic route captures route pattern", { timeout: TIMEOUT }, (t) => {
    const mock = new MockAgent();
    let scout: Scout;

    mock.start()
        .then(() => {
            scout = new Scout(buildScoutWithMock(mock));
            return scout.setup();
        })
        .then(() => {
            const app = makeApp(scout, (mw) => TestUtil.simpleDynamicSegmentExpressApp(mw));
            const sentPromise = nextRequestSent(scout);
            request(app).get("/dynamic/hello").end(() => undefined);
            return sentPromise;
        })
        .then((data) => {
            const spans = data.request.getChildSpansSync();
            const controllerSpan = spans.find((s) => s.operation.startsWith("Controller/"));

            t.ok(controllerSpan, "Controller span present for dynamic route");
            t.ok(
                controllerSpan && controllerSpan.operation.includes(":segment"),
                `Route pattern captured — operation: ${controllerSpan?.operation}`,
            );
            return TestUtil.shutdownScout(t, scout);
        })
        .then(() => mock.stop())
        .catch((err) => {
            mock.stop().catch(() => undefined);
            t.fail(err.message);
            t.end();
        });
});

test("Express error response is tagged on the request", { timeout: TIMEOUT }, (t) => {
    const mock = new MockAgent();
    let scout: Scout;

    mock.start()
        .then(() => {
            scout = new Scout(buildScoutWithMock(mock));
            return scout.setup();
        })
        .then(() => {
            const app = makeApp(scout, (mw) => TestUtil.simpleErrorApp(mw));
            const sentPromise = nextRequestSent(scout);
            request(app).get("/").end(() => undefined);
            return sentPromise;
        })
        .then((data) => {
            const errValue = data.request.getContextValue("error");

            t.ok(errValue !== undefined, "error context set on request");
            t.equal(errValue, "true", "error context value is 'true'");
            return TestUtil.shutdownScout(t, scout);
        })
        .then(() => mock.stop())
        .catch((err) => {
            mock.stop().catch(() => undefined);
            t.fail(err.message);
            t.end();
        });
});

test("Mock agent receives Register message on connect", { timeout: TIMEOUT }, (t) => {
    const mock = new MockAgent();
    let scout: Scout;

    mock.start()
        .then(() => {
            scout = new Scout(buildScoutWithMock(mock, { name: "test-app", key: "test-key" }));
            return scout.setup();
        })
        .then(() => mock.waitForMessage("Register"))
        .then((msg) => {
            t.ok(msg, "Register message received by mock agent");
            t.equal(msg.type, "Register", "message type is Register");
        })
        .then(() => scout.shutdown())
        .then(() => mock.stop())
        .then(() => t.end())
        .catch((err) => {
            mock.stop().catch(() => undefined);
            if (scout) { scout.shutdown().catch(() => undefined); }
            t.fail(err.message);
            t.end();
        });
});
