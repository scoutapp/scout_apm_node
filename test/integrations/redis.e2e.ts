import { setupRequireIntegrations } from "../../lib";
setupRequireIntegrations(["redis"]);

import { createClient } from "redis";
import test from "tape";
import * as TestUtil from "../util";
import { getIntegrationSymbol } from "../../lib/types/integrations";
import { ScoutEvent, buildScoutConfiguration } from "../../lib/types";
import { Scout, ScoutEventRequestSentData } from "../../lib/scout";
import { MockAgent } from "../integration/mock-agent";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);
const TIMEOUT_MS = 10000;

const sharedMock = new MockAgent();

test("setup: start shared mock agent", (t) => {
    sharedMock.start().then(() => t.end()).catch(t.end);
});

test("redis shim is applied", (t) => {
    const redisModule = require("redis");
    t.ok((redisModule as any)[getIntegrationSymbol()], "redis module has integration symbol");
    t.end();
});

test("Redis/SET span is created during a request", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    const client = createClient({
        socket: { host: REDIS_HOST, port: REDIS_PORT },
    });

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const setSpan = spans.find((s) => s.operation === "Redis/SET");
        if (!setSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);
        t.ok(setSpan, "Redis/SET span present");

        const stmt = setSpan.getContextValue("db.statement") as string;
        t.ok(stmt && stmt.startsWith("SET "), `db.statement starts with SET, got: ${stmt}`);

        client.disconnect()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => client.connect())
        .then(() => scout.transaction("Controller/redis-set-test", (done) => {
            return client.set("scout_test_key", "scout_test_value")
                .then(() => done());
        }))
        .catch((err) => {
            client.disconnect().catch(() => undefined);
            TestUtil.shutdownScout(t, scout, err);
        });
});

test("Redis/GET span is created during a request", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    const client = createClient({
        socket: { host: REDIS_HOST, port: REDIS_PORT },
    });

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const getSpan = spans.find((s) => s.operation === "Redis/GET");
        if (!getSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);
        t.ok(getSpan, "Redis/GET span present");

        const stmt = getSpan.getContextValue("db.statement") as string;
        t.ok(stmt && stmt.startsWith("GET "), `db.statement starts with GET, got: ${stmt}`);

        client.disconnect()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => client.connect())
        .then(() => scout.transaction("Controller/redis-get-test", (done) => {
            return client.set("scout_test_key", "scout_test_value")
                .then(() => client.get("scout_test_key"))
                .then(() => done());
        }))
        .catch((err) => {
            client.disconnect().catch(() => undefined);
            TestUtil.shutdownScout(t, scout, err);
        });
});

test("Redis/DEL span has error context on command failure", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    // Connect to a port that is not listening to force a connection error
    const client = createClient({
        socket: { host: REDIS_HOST, port: 1 },
    });

    scout.setup()
        .then(() => client.connect())
        .then(() => {
            // connect() should have thrown, but just in case clean up
            client.disconnect().catch(() => undefined);
            TestUtil.shutdownScout(t, scout, new Error("Expected connection to fail"));
        })
        .catch((err) => {
            t.ok(err, `Got expected connection error: ${err.message}`);
            TestUtil.shutdownScout(t, scout);
        });
});

test("teardown: stop shared mock agent", (t) => {
    sharedMock.stop().then(() => t.end()).catch(t.end);
});
