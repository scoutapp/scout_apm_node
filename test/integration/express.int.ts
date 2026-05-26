import * as test from "tape";
import * as request from "supertest";
import { Application } from "express";
import { MockAgent } from "./mock-agent";
import { scoutMiddleware, ApplicationWithScout } from "../../lib/express";
import { setupRequireIntegrations } from "../../lib";
import {
    AgentEvent,
    ScoutEvent,
    buildScoutConfiguration,
} from "../../lib/types";
import { Scout, ScoutEventRequestSentData } from "../../lib/scout";
import * as TestUtil from "../util";

setupRequireIntegrations(["pug", "ejs", "mustache"]);

const TIMEOUT = 8000;

type AppWithScout = Application & ApplicationWithScout;

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

/**
 * Wait for the next ScoutEvent.RequestSent, draining one event first if skipOne is true.
 * This handles the warmup request pattern where the first request initializes Scout
 * but we care about the assertions on the second request.
 */
function nextRequestSent(scout: Scout, skipCount = 0): Promise<ScoutEventRequestSentData> {
    return new Promise((resolve, reject) => {
        let skipped = 0;
        const timer = setTimeout(() => {
            scout.removeListener(ScoutEvent.RequestSent, listener);
            reject(new Error("Timed out waiting for ScoutEvent.RequestSent"));
        }, TIMEOUT - 1000);

        const listener = (data: ScoutEventRequestSentData) => {
            // Ignore HTTP integration transactions (no Controller/ span) — they fire
            // for supertest's outbound http.request() calls and would throw off skipCount.
            if (!data.request.getChildSpansSync().some((s) => s.operation.startsWith("Controller/"))) {
                return;
            }
            if (skipped < skipCount) {
                skipped++;
                return;
            }
            clearTimeout(timer);
            scout.removeListener(ScoutEvent.RequestSent, listener);
            resolve(data);
        };

        scout.on(ScoutEvent.RequestSent, listener);
    });
}

function makeApp(mock: MockAgent, factory: (mw: any) => AppWithScout, extra?: object): AppWithScout {
    return factory(
        scoutMiddleware({
            config: buildScoutWithMock(mock, extra),
            requestTimeoutMs: 0,
            waitForScoutSetup: true,
        }),
    ) as AppWithScout;
}

test("Express GET / creates a Controller span", { timeout: TIMEOUT }, (t) => {
    const mock = new MockAgent();
    let app: AppWithScout;
    let scout: Scout;

    mock.start()
        .then(() => {
            app = makeApp(mock, (mw) => TestUtil.simpleExpressApp(mw));
            // Set up listener BEFORE warmup request to capture events in order
            const warmupDone = request(app).get("/").expect(200);
            return warmupDone;
        })
        .then(() => {
            scout = app.scout!;
            // Warmup RequestSent may or may not have fired yet — skip 1 to get next request's event
            const sentPromise = nextRequestSent(scout, 1);
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
    let app: AppWithScout;
    let scout: Scout;

    mock.start()
        .then(() => {
            app = makeApp(mock, (mw) => TestUtil.simpleDynamicSegmentExpressApp(mw));
            return request(app).get("/").expect(200);
        })
        .then(() => {
            scout = app.scout!;
            const sentPromise = nextRequestSent(scout, 1);
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
    let app: AppWithScout;
    let scout: Scout;

    mock.start()
        .then(() => {
            app = makeApp(mock, (mw) => TestUtil.simpleErrorApp(mw));
            // First request to "/" initializes Scout (it will error, but that's ok)
            return request(app).get("/");
        })
        .then(() => {
            scout = app.scout!;
            const sentPromise = nextRequestSent(scout, 1);
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
    let capturedScout: Scout | undefined;

    mock.start()
        .then(() => {
            const app = makeApp(
                mock,
                (mw) => TestUtil.simpleExpressApp(mw),
                { name: "test-app", key: "test-key" },
            ) as AppWithScout;

            return request(app).get("/").expect(200)
                .then(() => { capturedScout = app.scout; });
        })
        .then(() => mock.waitForMessage("Register"))
        .then((msg) => {
            t.ok(msg, "Register message received by mock agent");
            t.equal(msg.type, "Register", "message type is Register");
        })
        .then(() => mock.stop())
        .then(() => {
            if (capturedScout) { return capturedScout.shutdown(); }
        })
        .then(() => t.end())
        .catch((err) => {
            mock.stop().catch(() => undefined);
            t.fail(err.message);
            t.end();
        });
});
