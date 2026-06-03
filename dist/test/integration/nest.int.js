"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
require("reflect-metadata");
const test = require("tape");
const request = require("supertest");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const mock_agent_1 = require("./mock-agent");
const nest_1 = require("../../lib/nest");
const scout_1 = require("../../lib/scout");
const types_1 = require("../../lib/types");
const TestUtil = require("../util");
const TIMEOUT = 20000;
// ── Minimal NestJS app used across all tests ─────────────────────────────────
let TestController = class TestController {
    home() { return { status: "ok" }; }
    dynamic() { return { status: "ok" }; }
};
tslib_1.__decorate([
    (0, common_1.Get)("/"),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", void 0)
], TestController.prototype, "home", null);
tslib_1.__decorate([
    (0, common_1.Get)("/dynamic/:segment"),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", void 0)
], TestController.prototype, "dynamic", null);
TestController = tslib_1.__decorate([
    (0, common_1.Controller)()
], TestController);
let ApiController = class ApiController {
    hello() { return { message: "hello" }; }
};
tslib_1.__decorate([
    (0, common_1.Get)("hello"),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", void 0)
], ApiController.prototype, "hello", null);
ApiController = tslib_1.__decorate([
    (0, common_1.Controller)("api")
], ApiController);
let ProductsController = class ProductsController {
    list() { return { route: "GET /products" }; }
    featured() { return { route: "GET /products/featured" }; }
    getById(id) { return { route: "GET /products/:id", id }; }
};
tslib_1.__decorate([
    (0, common_1.Get)(),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", void 0)
], ProductsController.prototype, "list", null);
tslib_1.__decorate([
    (0, common_1.Get)("featured"),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", void 0)
], ProductsController.prototype, "featured", null);
tslib_1.__decorate([
    (0, common_1.Get)(":id"),
    tslib_1.__param(0, (0, common_1.Param)("id")),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", void 0)
], ProductsController.prototype, "getById", null);
ProductsController = tslib_1.__decorate([
    (0, common_1.Controller)("products")
], ProductsController);
let OrdersController = class OrdersController {
    tracking(orderId, trackingId) { return { orderId, trackingId }; }
};
tslib_1.__decorate([
    (0, common_1.Get)(":orderId/tracking/:trackingId"),
    tslib_1.__param(0, (0, common_1.Param)("orderId")),
    tslib_1.__param(1, (0, common_1.Param)("trackingId")),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], OrdersController.prototype, "tracking", null);
OrdersController = tslib_1.__decorate([
    (0, common_1.Controller)("orders")
], OrdersController);
let TestModule = class TestModule {
};
TestModule = tslib_1.__decorate([
    (0, common_1.Module)({ controllers: [TestController, ApiController] })
], TestModule);
let ExtendedTestModule = class ExtendedTestModule {
};
ExtendedTestModule = tslib_1.__decorate([
    (0, common_1.Module)({ controllers: [TestController, ApiController, ProductsController, OrdersController] })
], ExtendedTestModule);
// ── Helpers ───────────────────────────────────────────────────────────────────
function buildConfig(mock, extra) {
    return (0, types_1.buildScoutConfiguration)(Object.assign({ monitor: true, coreAgentDownload: false, coreAgentLaunch: false, socketPath: mock.socketPath() }, extra));
}
function nextRequestSent(scout) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
            reject(new Error("Timed out waiting for ScoutEvent.RequestSent"));
        }, TIMEOUT - 3000);
        const listener = (data) => {
            if (!data.request.getChildSpansSync().some((s) => s.operation.startsWith("Controller/"))) {
                return;
            }
            clearTimeout(timer);
            scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
            resolve(data);
        };
        scout.on(types_1.ScoutEvent.RequestSent, listener);
    });
}
function makeNestApp(scout) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const app = yield core_1.NestFactory.create(TestModule, { logger: false });
        app.use((0, nest_1.nestMiddleware)({ scout, requestTimeoutMs: 0, waitForScoutSetup: true }));
        yield app.init();
        return app;
    });
}
function makeExtendedNestApp(scout) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const app = yield core_1.NestFactory.create(ExtendedTestModule, { logger: false });
        app.use((0, nest_1.nestMiddleware)({ scout, requestTimeoutMs: 0, waitForScoutSetup: true }));
        yield app.init();
        return app;
    });
}
// ── Tests ─────────────────────────────────────────────────────────────────────
test("NestJS GET / creates a Controller/GET span", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let nestApp;
    let scout;
    mock.start()
        .then(() => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
        scout = new scout_1.Scout(buildConfig(mock));
        yield scout.setup();
        nestApp = yield makeNestApp(scout);
    }))
        .then(() => {
        const sentPromise = nextRequestSent(scout);
        request(nestApp.getHttpServer()).get("/").end(() => undefined);
        return sentPromise;
    })
        .then((data) => {
        const spans = data.request.getChildSpansSync();
        const ctrl = spans.find((s) => s.operation.startsWith("Controller/"));
        t.ok(ctrl, "Controller span created");
        t.ok(ctrl === null || ctrl === void 0 ? void 0 : ctrl.operation.includes("GET"), "span includes GET");
        t.equal(ctrl === null || ctrl === void 0 ? void 0 : ctrl.operation, "Controller/GET /", "route path is /");
    })
        .then(() => nestApp.close())
        .then(() => TestUtil.shutdownScout(t, scout))
        .then(() => mock.stop())
        .catch((err) => {
        mock.stop().catch(() => undefined);
        nestApp === null || nestApp === void 0 ? void 0 : nestApp.close().catch(() => undefined);
        t.fail(err.message);
        t.end();
    });
});
test("NestJS dynamic route captures route pattern not concrete value", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let nestApp;
    let scout;
    mock.start()
        .then(() => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
        scout = new scout_1.Scout(buildConfig(mock));
        yield scout.setup();
        nestApp = yield makeNestApp(scout);
    }))
        .then(() => {
        const sentPromise = nextRequestSent(scout);
        request(nestApp.getHttpServer()).get("/dynamic/hello-world").end(() => undefined);
        return sentPromise;
    })
        .then((data) => {
        const spans = data.request.getChildSpansSync();
        const ctrl = spans.find((s) => s.operation.startsWith("Controller/"));
        t.ok(ctrl, "Controller span created for dynamic route");
        t.ok(ctrl === null || ctrl === void 0 ? void 0 : ctrl.operation.includes(":segment"), `route pattern captured, got: ${ctrl === null || ctrl === void 0 ? void 0 : ctrl.operation}`);
        t.notOk(ctrl === null || ctrl === void 0 ? void 0 : ctrl.operation.includes("hello-world"), "concrete value not in span operation");
    })
        .then(() => nestApp.close())
        .then(() => TestUtil.shutdownScout(t, scout))
        .then(() => mock.stop())
        .catch((err) => {
        mock.stop().catch(() => undefined);
        nestApp === null || nestApp === void 0 ? void 0 : nestApp.close().catch(() => undefined);
        t.fail(err.message);
        t.end();
    });
});
test("NestJS controller prefix is included in span operation", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let nestApp;
    let scout;
    mock.start()
        .then(() => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
        scout = new scout_1.Scout(buildConfig(mock));
        yield scout.setup();
        nestApp = yield makeNestApp(scout);
    }))
        .then(() => {
        const sentPromise = nextRequestSent(scout);
        request(nestApp.getHttpServer()).get("/api/hello").end(() => undefined);
        return sentPromise;
    })
        .then((data) => {
        const spans = data.request.getChildSpansSync();
        const ctrl = spans.find((s) => s.operation.startsWith("Controller/"));
        t.ok(ctrl, "Controller span created for prefixed route");
        t.equal(ctrl === null || ctrl === void 0 ? void 0 : ctrl.operation, "Controller/GET /api/hello", "full path with prefix captured");
    })
        .then(() => nestApp.close())
        .then(() => TestUtil.shutdownScout(t, scout))
        .then(() => mock.stop())
        .catch((err) => {
        mock.stop().catch(() => undefined);
        nestApp === null || nestApp === void 0 ? void 0 : nestApp.close().catch(() => undefined);
        t.fail(err.message);
        t.end();
    });
});
test("NestJS controller with arbitrary prefix resolves via router walk", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let nestApp;
    let scout;
    mock.start()
        .then(() => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
        scout = new scout_1.Scout(buildConfig(mock));
        yield scout.setup();
        nestApp = yield makeExtendedNestApp(scout);
    }))
        .then(() => {
        const sentPromise = nextRequestSent(scout);
        request(nestApp.getHttpServer()).get("/products/featured").end(() => undefined);
        return sentPromise;
    })
        .then((data) => {
        const spans = data.request.getChildSpansSync();
        const ctrl = spans.find((s) => s.operation.startsWith("Controller/"));
        t.ok(ctrl, "Controller span created for /products/featured");
        t.equal(ctrl === null || ctrl === void 0 ? void 0 : ctrl.operation, "Controller/GET /products/featured", "correct static sub-route under arbitrary prefix");
    })
        .then(() => nestApp.close())
        .then(() => TestUtil.shutdownScout(t, scout))
        .then(() => mock.stop())
        .catch((err) => {
        mock.stop().catch(() => undefined);
        nestApp === null || nestApp === void 0 ? void 0 : nestApp.close().catch(() => undefined);
        t.fail(err.message);
        t.end();
    });
});
test("NestJS parameterized route under arbitrary prefix resolves via router walk", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let nestApp;
    let scout;
    mock.start()
        .then(() => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
        scout = new scout_1.Scout(buildConfig(mock));
        yield scout.setup();
        nestApp = yield makeExtendedNestApp(scout);
    }))
        .then(() => {
        const sentPromise = nextRequestSent(scout);
        request(nestApp.getHttpServer()).get("/orders/42/tracking/TRK-999").end(() => undefined);
        return sentPromise;
    })
        .then((data) => {
        const spans = data.request.getChildSpansSync();
        const ctrl = spans.find((s) => s.operation.startsWith("Controller/"));
        t.ok(ctrl, "Controller span created for multi-param route");
        t.equal(ctrl === null || ctrl === void 0 ? void 0 : ctrl.operation, "Controller/GET /orders/:orderId/tracking/:trackingId", "multi-param pattern captured");
        t.notOk(ctrl === null || ctrl === void 0 ? void 0 : ctrl.operation.includes("42"), "concrete orderId not in operation");
        t.notOk(ctrl === null || ctrl === void 0 ? void 0 : ctrl.operation.includes("TRK-999"), "concrete trackingId not in operation");
    })
        .then(() => nestApp.close())
        .then(() => TestUtil.shutdownScout(t, scout))
        .then(() => mock.stop())
        .catch((err) => {
        mock.stop().catch(() => undefined);
        nestApp === null || nestApp === void 0 ? void 0 : nestApp.close().catch(() => undefined);
        t.fail(err.message);
        t.end();
    });
});
test("NestJS mock agent receives Register message on connect", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let nestApp;
    let scout;
    mock.start()
        .then(() => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
        scout = new scout_1.Scout(buildConfig(mock, { name: "nest-test-app", key: "test-key" }));
        yield scout.setup();
        nestApp = yield makeNestApp(scout);
    }))
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
        nestApp === null || nestApp === void 0 ? void 0 : nestApp.close().catch(() => undefined);
        t.fail(err.message);
        t.end();
    });
});
