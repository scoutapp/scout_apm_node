import "reflect-metadata";
import { setupRequireIntegrations } from "../../lib";
setupRequireIntegrations(["@nestjs/core"]);

import * as test from "tape";
import * as request from "supertest";
import {
    Module, Controller, Get, Post, Body,
    Injectable, CanActivate, ExecutionContext,
    NestInterceptor, CallHandler,
    PipeTransform, ArgumentMetadata,
    UseGuards, UseInterceptors, UsePipes,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { buildScoutConfiguration, ScoutEvent } from "../../lib/types";
import { Scout, ScoutEventRequestSentData } from "../../lib/scout";
import { nestMiddleware } from "../../lib/nest";
import { ScoutSpanOperation } from "../../lib/types";
import { MockAgent } from "../integration/mock-agent";

function shutdownScout(t: any, scout: Scout, err?: Error): Promise<void> {
    if (!scout) { t.end(err); return Promise.resolve(); }
    return scout.shutdown()
        .then(() => { if (err) { console.log("ERROR:", err); } t.end(err); })
        .catch(() => t.end(err));
}

const TIMEOUT = 15000;

// ── Guards ───────────────────────────────────────────────────────────────────

@Injectable()
class AuthGuard implements CanActivate {
    canActivate(_ctx: ExecutionContext): boolean {
        // Simulate a real auth check
        return true;
    }
}

@Injectable()
class RejectGuard implements CanActivate {
    canActivate(_ctx: ExecutionContext): boolean {
        return false;
    }
}

// ── Interceptors ─────────────────────────────────────────────────────────────

@Injectable()
class TimingInterceptor implements NestInterceptor {
    intercept(_ctx: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(tap(() => undefined));
    }
}

// ── Pipes ────────────────────────────────────────────────────────────────────

@Injectable()
class UpperCasePipe implements PipeTransform {
    transform(value: any, _meta: ArgumentMetadata): any {
        return typeof value === "string" ? value.toUpperCase() : value;
    }
}

// ── Controllers ──────────────────────────────────────────────────────────────

@Controller()
class PipelineController {
    @Get("/guarded")
    @UseGuards(AuthGuard)
    guarded() { return { guarded: true }; }

    @Get("/intercepted")
    @UseInterceptors(TimingInterceptor)
    intercepted() { return { intercepted: true }; }

    @Post("/piped")
    @UsePipes(UpperCasePipe)
    piped(@Body() body: any) { return { value: body.value }; }

    @Get("/plain")
    plain() { return { ok: true }; }
}

@Module({ controllers: [PipelineController] })
class PipelineModule {}

// ── Helpers ───────────────────────────────────────────────────────────────────

const sharedMock = new MockAgent();

function allSpansFlat(spans: any[]): any[] {
    const result: any[] = [];
    for (const s of spans) {
        result.push(s);
        result.push(...allSpansFlat(s.getChildSpansSync()));
    }
    return result;
}

function nextPipelineRequest(scout: Scout): Promise<ScoutEventRequestSentData> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            scout.removeListener(ScoutEvent.RequestSent, listener);
            reject(new Error("Timed out waiting for ScoutEvent.RequestSent"));
        }, TIMEOUT - 2000);

        const listener = (data: ScoutEventRequestSentData) => {
            const spans = data.request.getChildSpansSync();
            if (!spans.some((s) => s.operation.startsWith("Controller/"))) { return; }
            clearTimeout(timer);
            scout.removeListener(ScoutEvent.RequestSent, listener);
            resolve(data);
        };

        scout.on(ScoutEvent.RequestSent, listener);
    });
}

async function makeApp(scout: Scout) {
    const app = await NestFactory.create(PipelineModule, { logger: false });
    app.use(nestMiddleware({ requestTimeoutMs: 0 }));
    await app.init();
    return app;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

test("setup: start shared mock agent", (t) => {
    sharedMock.start().then(() => t.end()).catch(t.end);
});

// ── Guards ────────────────────────────────────────────────────────────────────

test("NestJS/Guards span is created for a guarded route", { timeout: TIMEOUT }, async (t) => {
    const scout = new Scout(buildScoutConfiguration({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    let app: any;
    try {
        await scout.setup();
        app = await makeApp(scout);

        const pending = nextPipelineRequest(scout);
        await request(app.getHttpServer()).get("/guarded");
        const data = await pending;

        const spans = allSpansFlat(data.request.getChildSpansSync());
        const guardSpan = spans.find((s) => s.operation === ScoutSpanOperation.NestJSGuards);

        t.ok(guardSpan, "NestJS/Guards span is present");
    } finally {
        if (app) { await app.close().catch(() => undefined); }
        await shutdownScout(t, scout);
    }
});

// ── Interceptors ──────────────────────────────────────────────────────────────

test("NestJS/Interceptors span is created for an intercepted route", { timeout: TIMEOUT }, async (t) => {
    const scout = new Scout(buildScoutConfiguration({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    let app: any;
    try {
        await scout.setup();
        app = await makeApp(scout);

        const pending = nextPipelineRequest(scout);
        await request(app.getHttpServer()).get("/intercepted");
        const data = await pending;

        const spans = allSpansFlat(data.request.getChildSpansSync());
        const interceptorSpan = spans.find((s) => s.operation === ScoutSpanOperation.NestJSInterceptors);

        t.ok(interceptorSpan, "NestJS/Interceptors span is present");
    } finally {
        if (app) { await app.close().catch(() => undefined); }
        await shutdownScout(t, scout);
    }
});

// ── Pipes ─────────────────────────────────────────────────────────────────────

test("NestJS/Pipes span is created for a route with pipes", { timeout: TIMEOUT }, async (t) => {
    const scout = new Scout(buildScoutConfiguration({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    let app: any;
    try {
        await scout.setup();
        app = await makeApp(scout);

        const pending = nextPipelineRequest(scout);
        await request(app.getHttpServer())
            .post("/piped")
            .send({ value: "hello" })
            .set("Content-Type", "application/json");
        const data = await pending;

        const spans = allSpansFlat(data.request.getChildSpansSync());
        const pipeSpan = spans.find((s) => s.operation === ScoutSpanOperation.NestJSPipes);

        t.ok(pipeSpan, "NestJS/Pipes span is present");
    } finally {
        if (app) { await app.close().catch(() => undefined); }
        await shutdownScout(t, scout);
    }
});

// ── No extra spans on plain routes ────────────────────────────────────────────

test("no NestJS pipeline spans on plain routes", { timeout: TIMEOUT }, async (t) => {
    const scout = new Scout(buildScoutConfiguration({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    let app: any;
    try {
        await scout.setup();
        app = await makeApp(scout);

        const pending = nextPipelineRequest(scout);
        await request(app.getHttpServer()).get("/plain");
        const data = await pending;

        const spans = allSpansFlat(data.request.getChildSpansSync());
        const pipelineSpans = spans.filter((s) =>
            s.operation === ScoutSpanOperation.NestJSGuards ||
            s.operation === ScoutSpanOperation.NestJSPipes ||
            s.operation === ScoutSpanOperation.NestJSInterceptors,
        );

        t.equal(pipelineSpans.length, 0, "no pipeline spans on a plain route");
    } finally {
        if (app) { await app.close().catch(() => undefined); }
        await shutdownScout(t, scout);
    }
});

// ── Teardown ──────────────────────────────────────────────────────────────────

test("teardown: stop shared mock agent", (t) => {
    sharedMock.stop().then(() => t.end()).catch(t.end);
});
