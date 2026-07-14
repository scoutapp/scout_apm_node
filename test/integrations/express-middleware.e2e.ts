import * as test from "tape";
import * as request from "supertest";
import { Application } from "express";

import {
    ScoutEvent,
    buildScoutConfiguration,
} from "../../lib/types";

import { setupRequireIntegrations } from "../../lib";

import {
    Scout,
    ScoutRequest,
    ScoutSpan,
    ScoutEventRequestSentData,
} from "../../lib/scout";

setupRequireIntegrations(["express", "express/lib/router/layer"]);

import * as TestUtil from "../util";
import ExpressIntegration from "../../lib/integrations/express";
import { scoutMiddleware, ApplicationWithScout } from "../../lib/express";
import { ScoutContextName, ScoutSpanOperation, ExpressFn } from "../../lib/types";

// Helper: build an express app with named middleware that has an artificial delay
function appWithNamedMiddleware(
    middlewareFn: any,
    shimFn: (fn: ExpressFn) => ExpressFn,
): Application & ApplicationWithScout {
    const express = shimFn(require("express"));
    const app: Application & ApplicationWithScout = express();
    app.use(middlewareFn);

    app.use(async function dbSessionLoad(req: any, res: any, next: any) {
        await new Promise(r => setTimeout(r, 5));
        next();
    });

    app.use(function corsCheck(req: any, res: any, next: any) {
        next();
    });

    // Anonymous middleware — should NOT generate a span by default
    app.use((req: any, res: any, next: any) => { next(); });

    app.get("/users", (req: any, res: any) => {
        res.json({ users: [] });
    });

    return app;
}

test("named middleware creates Middleware/ spans", t => {
    const config = buildScoutConfiguration({ monitor: true });
    const scout = new Scout(config);

    const app = appWithNamedMiddleware(
        scoutMiddleware({ scout, requestTimeoutMs: 0 }),
        (fn: ExpressFn) => ExpressIntegration.shimExpressFn(fn),
    );

    const listener = (data: ScoutEventRequestSentData) => {
        if (!data || !data.request) { return; }
        const spans = data.request.getChildSpansSync();
        if (!spans || spans.length === 0) { return; }

        const topSpan = spans[0];
        if (!topSpan.operation.startsWith("Controller")) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Find the dbSessionLoad middleware span
        const allSpans = topSpan.getChildSpansSync ? topSpan.getChildSpansSync() : [];
        const middlewareSpan = allSpans.find((s: ScoutSpan) => s.operation === "Middleware/dbSessionLoad");
        t.assert(middlewareSpan, "Middleware/dbSessionLoad span exists");

        // corsCheck should also have a span
        const corsSpan = allSpans.find((s: ScoutSpan) => s.operation === "Middleware/corsCheck");
        t.assert(corsSpan, "Middleware/corsCheck span exists");

        // Anonymous arrow function should NOT have a span
        const anonSpan = allSpans.find((s: ScoutSpan) => s.operation === "Middleware/anonymous");
        t.assert(!anonSpan, "anonymous middleware does not create a span");

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
        .then(() => {
            return request(app)
                .get("/users")
                .expect(200)
                .then(res => t.assert(res, "request sent"));
        })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("anonymous middleware creates span when expressInstrumentAnonymousMiddleware=true", t => {
    const config = buildScoutConfiguration({
        monitor: true,
        expressInstrumentAnonymousMiddleware: true,
    });
    const scout = new Scout(config);

    const express = ExpressIntegration.shimExpressFn(require("express"));
    const app: Application & ApplicationWithScout = express();
    app.use(scoutMiddleware({ scout, requestTimeoutMs: 0 }));
    app.use((req: any, res: any, next: any) => { next(); });
    app.get("/ping", (req: any, res: any) => res.json({ ok: true }));

    const listener = (data: ScoutEventRequestSentData) => {
        if (!data || !data.request) { return; }
        const spans = data.request.getChildSpansSync();
        if (!spans || spans.length === 0) { return; }
        const topSpan = spans[0];
        if (!topSpan.operation.startsWith("Controller")) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);

        const allSpans = topSpan.getChildSpansSync ? topSpan.getChildSpansSync() : [];
        const anonSpan = allSpans.find((s: ScoutSpan) => s.operation === "Middleware/anonymous");
        t.assert(anonSpan, "anonymous middleware creates a span when configured");

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
        .then(() => {
            return request(app)
                .get("/ping")
                .expect(200)
                .then(res => t.assert(res, "request sent"));
        })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
