import "reflect-metadata";
import test from "tape";
import request from "supertest";
import { NestFactory } from "@nestjs/core";
import { Module, Controller, Get } from "@nestjs/common";
import { MockAgent } from "./mock-agent";
import { nestMiddleware } from "../../lib/nest";
import { Scout } from "../../lib/scout";
import { buildScoutConfiguration, ScoutEvent } from "../../lib/types";
import { ScoutEventRequestSentData } from "../../lib/scout";
import * as TestUtil from "../util";

const TIMEOUT = 12000;

// ── Minimal NestJS app used across all tests ─────────────────────────────────

@Controller()
class TestController {
    @Get("/")
    public home() { return { status: "ok" }; }

    @Get("/dynamic/:segment")
    public dynamic() { return { status: "ok" }; }
}

@Controller("api")
class ApiController {
    @Get("hello")
    public hello() { return { message: "hello" }; }
}

@Module({ controllers: [TestController, ApiController] })
class TestModule {}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildConfig(mock: MockAgent, extra?: object) {
    return buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: mock.socketPath(),
        ...extra,
    });
}

function nextRequestSent(scout: Scout, skipCount = 0): Promise<ScoutEventRequestSentData> {
    return new Promise((resolve, reject) => {
        let skipped = 0;
        const timer = setTimeout(() => {
            scout.removeListener(ScoutEvent.RequestSent, listener);
            reject(new Error("Timed out waiting for ScoutEvent.RequestSent"));
        }, TIMEOUT - 2000);

        const listener = (data: ScoutEventRequestSentData) => {
            if (!data.request.getChildSpansSync().some((s) => s.operation.startsWith("Controller/"))) {
                return;
            }
            if (skipped < skipCount) { skipped++; return; }
            clearTimeout(timer);
            scout.removeListener(ScoutEvent.RequestSent, listener);
            resolve(data);
        };

        scout.on(ScoutEvent.RequestSent, listener);
    });
}

async function makeNestApp(scout: Scout): Promise<any> {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.use(nestMiddleware({ scout, requestTimeoutMs: 0, waitForScoutSetup: true }));
    await app.init();
    return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("NestJS GET / creates a Controller/GET span", { timeout: TIMEOUT }, (t) => {
    const mock = new MockAgent();
    let nestApp: any;
    let scout: Scout;

    mock.start()
        .then(async () => {
            scout = new Scout(buildConfig(mock));
            nestApp = await makeNestApp(scout);
            // warmup — initialises Scout connection
            await request(nestApp.getHttpServer()).get("/").expect(200);
        })
        .then(() => {
            const sentPromise = nextRequestSent(scout, 1);
            request(nestApp.getHttpServer()).get("/").end(() => undefined);
            return sentPromise;
        })
        .then((data) => {
            const spans = data.request.getChildSpansSync();
            const ctrl = spans.find((s) => s.operation.startsWith("Controller/"));
            t.ok(ctrl, "Controller span created");
            t.ok(ctrl?.operation.includes("GET"), "span includes GET");
            t.equal(ctrl?.operation, "Controller/GET /", "route path is /");
        })
        .then(() => nestApp.close())
        .then(() => TestUtil.shutdownScout(t, scout))
        .then(() => mock.stop())
        .catch((err) => {
            mock.stop().catch(() => undefined);
            nestApp?.close().catch(() => undefined);
            t.fail(err.message);
            t.end();
        });
});

test("NestJS dynamic route captures route pattern not concrete value", { timeout: TIMEOUT }, (t) => {
    const mock = new MockAgent();
    let nestApp: any;
    let scout: Scout;

    mock.start()
        .then(async () => {
            scout = new Scout(buildConfig(mock));
            nestApp = await makeNestApp(scout);
            await request(nestApp.getHttpServer()).get("/").expect(200);
        })
        .then(() => {
            const sentPromise = nextRequestSent(scout, 1);
            request(nestApp.getHttpServer()).get("/dynamic/hello-world").end(() => undefined);
            return sentPromise;
        })
        .then((data) => {
            const spans = data.request.getChildSpansSync();
            const ctrl = spans.find((s) => s.operation.startsWith("Controller/"));
            t.ok(ctrl, "Controller span created for dynamic route");
            t.ok(
                ctrl?.operation.includes(":segment"),
                `route pattern captured, got: ${ctrl?.operation}`,
            );
            t.notOk(
                ctrl?.operation.includes("hello-world"),
                "concrete value not in span operation",
            );
        })
        .then(() => nestApp.close())
        .then(() => TestUtil.shutdownScout(t, scout))
        .then(() => mock.stop())
        .catch((err) => {
            mock.stop().catch(() => undefined);
            nestApp?.close().catch(() => undefined);
            t.fail(err.message);
            t.end();
        });
});

test("NestJS controller prefix is included in span operation", { timeout: TIMEOUT }, (t) => {
    const mock = new MockAgent();
    let nestApp: any;
    let scout: Scout;

    mock.start()
        .then(async () => {
            scout = new Scout(buildConfig(mock));
            nestApp = await makeNestApp(scout);
            await request(nestApp.getHttpServer()).get("/").expect(200);
        })
        .then(() => {
            const sentPromise = nextRequestSent(scout, 1);
            request(nestApp.getHttpServer()).get("/api/hello").end(() => undefined);
            return sentPromise;
        })
        .then((data) => {
            const spans = data.request.getChildSpansSync();
            const ctrl = spans.find((s) => s.operation.startsWith("Controller/"));
            t.ok(ctrl, "Controller span created for prefixed route");
            t.equal(ctrl?.operation, "Controller/GET /api/hello", "full path with prefix captured");
        })
        .then(() => nestApp.close())
        .then(() => TestUtil.shutdownScout(t, scout))
        .then(() => mock.stop())
        .catch((err) => {
            mock.stop().catch(() => undefined);
            nestApp?.close().catch(() => undefined);
            t.fail(err.message);
            t.end();
        });
});

test("NestJS mock agent receives Register message on connect", { timeout: TIMEOUT }, (t) => {
    const mock = new MockAgent();
    let nestApp: any;
    let scout: Scout;

    mock.start()
        .then(async () => {
            scout = new Scout(buildConfig(mock, { name: "nest-test-app", key: "test-key" }));
            nestApp = await makeNestApp(scout);
            await request(nestApp.getHttpServer()).get("/").expect(200);
        })
        .then(() => mock.waitForMessage("Register"))
        .then((msg) => {
            t.ok(msg, "Register message received");
            t.equal(msg.type, "Register", "message type is Register");
        })
        .then(() => nestApp.close())
        .then(() => scout.shutdown())
        .then(() => mock.stop())
        .then(() => t.end())
        .catch((err) => {
            mock.stop().catch(() => undefined);
            nestApp?.close().catch(() => undefined);
            t.fail(err.message);
            t.end();
        });
});
