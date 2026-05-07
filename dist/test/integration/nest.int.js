"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const tape_1 = __importDefault(require("tape"));
const supertest_1 = __importDefault(require("supertest"));
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const mock_agent_1 = require("./mock-agent");
const nest_1 = require("../../lib/nest");
const scout_1 = require("../../lib/scout");
const types_1 = require("../../lib/types");
const TestUtil = __importStar(require("../util"));
const TIMEOUT = 12000;
// ── Minimal NestJS app used across all tests ─────────────────────────────────
let TestController = class TestController {
    home() { return { status: "ok" }; }
    dynamic() { return { status: "ok" }; }
};
__decorate([
    (0, common_1.Get)("/"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TestController.prototype, "home", null);
__decorate([
    (0, common_1.Get)("/dynamic/:segment"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TestController.prototype, "dynamic", null);
TestController = __decorate([
    (0, common_1.Controller)()
], TestController);
let ApiController = class ApiController {
    hello() { return { message: "hello" }; }
};
__decorate([
    (0, common_1.Get)("hello"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ApiController.prototype, "hello", null);
ApiController = __decorate([
    (0, common_1.Controller)("api")
], ApiController);
let TestModule = class TestModule {
};
TestModule = __decorate([
    (0, common_1.Module)({ controllers: [TestController, ApiController] })
], TestModule);
// ── Helpers ───────────────────────────────────────────────────────────────────
function buildConfig(mock, extra) {
    return (0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: mock.socketPath(),
        ...extra,
    });
}
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
async function makeNestApp(scout) {
    const app = await core_1.NestFactory.create(TestModule, { logger: false });
    app.use((0, nest_1.nestMiddleware)({ scout, requestTimeoutMs: 0, waitForScoutSetup: true }));
    await app.init();
    return app;
}
// ── Tests ─────────────────────────────────────────────────────────────────────
(0, tape_1.default)("NestJS GET / creates a Controller/GET span", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let nestApp;
    let scout;
    mock.start()
        .then(async () => {
        scout = new scout_1.Scout(buildConfig(mock));
        nestApp = await makeNestApp(scout);
        // warmup — initialises Scout connection
        await (0, supertest_1.default)(nestApp.getHttpServer()).get("/").expect(200);
    })
        .then(() => {
        const sentPromise = nextRequestSent(scout, 1);
        (0, supertest_1.default)(nestApp.getHttpServer()).get("/").end(() => undefined);
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
(0, tape_1.default)("NestJS dynamic route captures route pattern not concrete value", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let nestApp;
    let scout;
    mock.start()
        .then(async () => {
        scout = new scout_1.Scout(buildConfig(mock));
        nestApp = await makeNestApp(scout);
        await (0, supertest_1.default)(nestApp.getHttpServer()).get("/").expect(200);
    })
        .then(() => {
        const sentPromise = nextRequestSent(scout, 1);
        (0, supertest_1.default)(nestApp.getHttpServer()).get("/dynamic/hello-world").end(() => undefined);
        return sentPromise;
    })
        .then((data) => {
        const spans = data.request.getChildSpansSync();
        const ctrl = spans.find((s) => s.operation.startsWith("Controller/"));
        t.ok(ctrl, "Controller span created for dynamic route");
        t.ok(ctrl?.operation.includes(":segment"), `route pattern captured, got: ${ctrl?.operation}`);
        t.notOk(ctrl?.operation.includes("hello-world"), "concrete value not in span operation");
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
(0, tape_1.default)("NestJS controller prefix is included in span operation", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let nestApp;
    let scout;
    mock.start()
        .then(async () => {
        scout = new scout_1.Scout(buildConfig(mock));
        nestApp = await makeNestApp(scout);
        await (0, supertest_1.default)(nestApp.getHttpServer()).get("/").expect(200);
    })
        .then(() => {
        const sentPromise = nextRequestSent(scout, 1);
        (0, supertest_1.default)(nestApp.getHttpServer()).get("/api/hello").end(() => undefined);
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
(0, tape_1.default)("NestJS mock agent receives Register message on connect", { timeout: TIMEOUT }, (t) => {
    const mock = new mock_agent_1.MockAgent();
    let nestApp;
    let scout;
    mock.start()
        .then(async () => {
        scout = new scout_1.Scout(buildConfig(mock, { name: "nest-test-app", key: "test-key" }));
        nestApp = await makeNestApp(scout);
        await (0, supertest_1.default)(nestApp.getHttpServer()).get("/").expect(200);
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
