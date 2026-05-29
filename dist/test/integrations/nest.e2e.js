"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
require("reflect-metadata");
const test = require("tape");
const request = require("supertest");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const lib_1 = require("../../lib");
const types_1 = require("../../lib/types");
const scout_1 = require("../../lib/scout");
const nest_1 = require("../../lib/nest");
const TestUtil = require("../util");
(0, lib_1.setupRequireIntegrations)(["mustache", "http"]);
const TIMEOUT = 15000;
// ── Shared test controllers ───────────────────────────────────────────────────
let BasicController = class BasicController {
    home() { return { status: "ok" }; }
    item() { return { status: "ok" }; }
};
tslib_1.__decorate([
    (0, common_1.Get)("/"),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", void 0)
], BasicController.prototype, "home", null);
tslib_1.__decorate([
    (0, common_1.Get)("/items/:id"),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", void 0)
], BasicController.prototype, "item", null);
BasicController = tslib_1.__decorate([
    (0, common_1.Controller)()
], BasicController);
let BasicModule = class BasicModule {
};
BasicModule = tslib_1.__decorate([
    (0, common_1.Module)({ controllers: [BasicController] })
], BasicModule);
// ── Helpers ───────────────────────────────────────────────────────────────────
function nextRequestSent(scout, skipCount = 0) {
    return new Promise((resolve, reject) => {
        let skipped = 0;
        const timer = setTimeout(() => {
            scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
            reject(new Error("Timed out waiting for ScoutEvent.RequestSent"));
        }, TIMEOUT - 2000);
        const listener = (data) => {
            if (!data.request.getChildSpansSync().some((s) => s.operation.startsWith("Controller/"))) {
                return;
            }
            if (skipped < skipCount) {
                skipped++;
                return;
            }
            clearTimeout(timer);
            scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
            resolve(data);
        };
        scout.on(types_1.ScoutEvent.RequestSent, listener);
    });
}
// ── Tests ─────────────────────────────────────────────────────────────────────
test("nestMiddleware is a function", (t) => {
    t.equal(typeof nest_1.nestMiddleware, "function", "nestMiddleware is exported");
    t.equal(typeof (0, nest_1.nestMiddleware)(), "function", "nestMiddleware() returns a middleware function");
    t.end();
});
test("NestJS app instruments root route", { timeout: TIMEOUT }, (t) => {
    const config = (0, types_1.buildScoutConfiguration)({ monitor: true });
    const scout = new scout_1.Scout(config);
    let nestApp;
    core_1.NestFactory.create(BasicModule, { logger: false })
        .then((app) => {
        nestApp = app;
        app.use((0, nest_1.nestMiddleware)({ scout, requestTimeoutMs: 0, waitForScoutSetup: true }));
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
        t.equal(ctrl === null || ctrl === void 0 ? void 0 : ctrl.operation, "Controller/GET /", "operation is Controller/GET /");
    })
        .then(() => nestApp.close())
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch((err) => {
        nestApp === null || nestApp === void 0 ? void 0 : nestApp.close().catch(() => undefined);
        TestUtil.shutdownScout(t, scout, err);
    });
});
test("NestJS parameterised route captures pattern not value", { timeout: TIMEOUT }, (t) => {
    const config = (0, types_1.buildScoutConfiguration)({ monitor: true });
    const scout = new scout_1.Scout(config);
    let nestApp;
    core_1.NestFactory.create(BasicModule, { logger: false })
        .then((app) => {
        nestApp = app;
        app.use((0, nest_1.nestMiddleware)({ scout, requestTimeoutMs: 0, waitForScoutSetup: true }));
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
        t.ok(ctrl === null || ctrl === void 0 ? void 0 : ctrl.operation.includes(":id"), `includes :id pattern — got ${ctrl === null || ctrl === void 0 ? void 0 : ctrl.operation}`);
        t.notOk(ctrl === null || ctrl === void 0 ? void 0 : ctrl.operation.includes("42"), "concrete value 42 not in operation");
    })
        .then(() => nestApp.close())
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch((err) => {
        nestApp === null || nestApp === void 0 ? void 0 : nestApp.close().catch(() => undefined);
        TestUtil.shutdownScout(t, scout, err);
    });
});
