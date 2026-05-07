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
const lib_1 = require("../../lib");
const types_1 = require("../../lib/types");
const scout_1 = require("../../lib/scout");
const nest_1 = require("../../lib/nest");
const TestUtil = __importStar(require("../util"));
(0, lib_1.setupRequireIntegrations)(["mustache", "http"]);
const TIMEOUT = 15000;
// ── Shared test controllers ───────────────────────────────────────────────────
let BasicController = class BasicController {
    home() { return { status: "ok" }; }
    item() { return { status: "ok" }; }
};
__decorate([
    (0, common_1.Get)("/"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BasicController.prototype, "home", null);
__decorate([
    (0, common_1.Get)("/items/:id"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BasicController.prototype, "item", null);
BasicController = __decorate([
    (0, common_1.Controller)()
], BasicController);
let BasicModule = class BasicModule {
};
BasicModule = __decorate([
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
(0, tape_1.default)("nestMiddleware is a function", (t) => {
    t.equal(typeof nest_1.nestMiddleware, "function", "nestMiddleware is exported");
    t.equal(typeof (0, nest_1.nestMiddleware)(), "function", "nestMiddleware() returns a middleware function");
    t.end();
});
(0, tape_1.default)("NestJS app instruments root route", { timeout: TIMEOUT }, (t) => {
    const config = (0, types_1.buildScoutConfiguration)({ allowShutdown: true, monitor: true });
    const scout = new scout_1.Scout(config);
    let nestApp;
    core_1.NestFactory.create(BasicModule, { logger: false })
        .then((app) => {
        nestApp = app;
        app.use((0, nest_1.nestMiddleware)({ scout, requestTimeoutMs: 0, waitForScoutSetup: true }));
        return app.init();
    })
        .then(() => (0, supertest_1.default)(nestApp.getHttpServer()).get("/").expect(200))
        .then(() => {
        const sentPromise = nextRequestSent(scout, 1);
        (0, supertest_1.default)(nestApp.getHttpServer()).get("/").end(() => undefined);
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
(0, tape_1.default)("NestJS parameterised route captures pattern not value", { timeout: TIMEOUT }, (t) => {
    const config = (0, types_1.buildScoutConfiguration)({ allowShutdown: true, monitor: true });
    const scout = new scout_1.Scout(config);
    let nestApp;
    core_1.NestFactory.create(BasicModule, { logger: false })
        .then((app) => {
        nestApp = app;
        app.use((0, nest_1.nestMiddleware)({ scout, requestTimeoutMs: 0, waitForScoutSetup: true }));
        return app.init();
    })
        .then(() => (0, supertest_1.default)(nestApp.getHttpServer()).get("/").expect(200))
        .then(() => {
        const sentPromise = nextRequestSent(scout, 1);
        (0, supertest_1.default)(nestApp.getHttpServer()).get("/items/42").end(() => undefined);
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
