import "reflect-metadata";
import * as test from "tape";
import * as request from "supertest";
import { NestFactory } from "@nestjs/core";
import { Module, Controller, Get, Res } from "@nestjs/common";
import { setupRequireIntegrations } from "../../lib";
import { buildScoutConfiguration, ScoutEvent } from "../../lib/types";
import { Scout, ScoutEventRequestSentData } from "../../lib/scout";
import { nestMiddleware } from "../../lib/nest";
import * as TestUtil from "../util";
import { ScoutContextName, ScoutSpanOperation } from "../../lib/types";

setupRequireIntegrations(["mustache", "http"]);

const TIMEOUT = 15000;

// ── Shared test controllers ───────────────────────────────────────────────────

@Controller()
class BasicController {
    @Get("/")
    public home() { return { status: "ok" }; }

    @Get("/items/:id")
    public item() { return { status: "ok" }; }
}

@Module({ controllers: [BasicController] })
class BasicModule {}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Tests ─────────────────────────────────────────────────────────────────────

test("nestMiddleware is a function", (t) => {
    t.equal(typeof nestMiddleware, "function", "nestMiddleware is exported");
    t.equal(typeof nestMiddleware(), "function", "nestMiddleware() returns a middleware function");
    t.end();
});

test("NestJS app instruments root route", { timeout: TIMEOUT }, (t) => {
    const config = buildScoutConfiguration({ allowShutdown: true, monitor: true });
    const scout = new Scout(config);
    let nestApp: any;

    NestFactory.create(BasicModule, { logger: false })
        .then((app) => {
            nestApp = app;
            app.use(nestMiddleware({ scout, requestTimeoutMs: 0, waitForScoutSetup: true }));
            return app.init();
        })
        .then(() => request(nestApp.getHttpServer()).get("/").expect(200))
        .then(() => {
            const sentPromise = nextRequestSent(scout, 1);
            request(nestApp.getHttpServer()).get("/").end(() => undefined);
            return sentPromise;
        })
        .then((data) => {
            const spans = data.request.getChildSpansSync();
            const ctrl = spans.find((s) => s.operation.startsWith("Controller/GET"));
            t.ok(ctrl, "Controller/GET span present");
            t.equal(ctrl?.operation, "Controller/GET /", "operation is Controller/GET /");
        })
        .then(() => nestApp.close())
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch((err) => {
            nestApp?.close().catch(() => undefined);
            TestUtil.shutdownScout(t, scout, err);
        });
});

test("NestJS parameterised route captures pattern not value", { timeout: TIMEOUT }, (t) => {
    const config = buildScoutConfiguration({ allowShutdown: true, monitor: true });
    const scout = new Scout(config);
    let nestApp: any;

    NestFactory.create(BasicModule, { logger: false })
        .then((app) => {
            nestApp = app;
            app.use(nestMiddleware({ scout, requestTimeoutMs: 0, waitForScoutSetup: true }));
            return app.init();
        })
        .then(() => request(nestApp.getHttpServer()).get("/").expect(200))
        .then(() => {
            const sentPromise = nextRequestSent(scout, 1);
            request(nestApp.getHttpServer()).get("/items/42").end(() => undefined);
            return sentPromise;
        })
        .then((data) => {
            const spans = data.request.getChildSpansSync();
            const ctrl = spans.find((s) => s.operation.startsWith("Controller/GET"));
            t.ok(ctrl, "Controller span created");
            t.ok(ctrl?.operation.includes(":id"), `includes :id pattern — got ${ctrl?.operation}`);
            t.notOk(ctrl?.operation.includes("42"), "concrete value 42 not in operation");
        })
        .then(() => nestApp.close())
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch((err) => {
            nestApp?.close().catch(() => undefined);
            TestUtil.shutdownScout(t, scout, err);
        });
});
