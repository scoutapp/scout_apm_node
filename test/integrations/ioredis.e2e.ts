import { setupRequireIntegrations } from "../../lib";
setupRequireIntegrations(["ioredis"]);

import Redis from "ioredis";
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

test("ioredis shim is applied", (t) => {
    t.ok((Redis as any)[getIntegrationSymbol()], "Redis class has integration symbol");
    t.end();
});

test("Cache/SET span is created during a request", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));
    const client = new Redis({ host: REDIS_HOST, port: REDIS_PORT, lazyConnect: true });

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const setSpan = spans.find((s) => s.operation === "Cache/SET");
        if (!setSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);
        t.ok(setSpan, "Cache/SET span present");
        t.ok(setSpan.getContextValue("db.statement"), "db.statement context set");

        client.quit()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => client.connect())
        .then(() => scout.transaction("Controller/ioredis-set-test", (done) => {
            return client.set("scout_test_key", "scout_test_value")
                .then(() => done());
        }))
        .catch((err) => {
            client.quit().catch(() => undefined);
            TestUtil.shutdownScout(t, scout, err);
        });
});

test("Cache/GET span is created during a request", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));
    const client = new Redis({ host: REDIS_HOST, port: REDIS_PORT, lazyConnect: true });

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const getSpan = spans.find((s) => s.operation === "Cache/GET");
        if (!getSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);
        t.ok(getSpan, "Cache/GET span present");

        const stmt = getSpan.getContextValue("db.statement") as string;
        t.ok(stmt && stmt.startsWith("GET "), `db.statement starts with GET, got: ${stmt}`);

        client.quit()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => client.connect())
        .then(() => scout.transaction("Controller/ioredis-get-test", (done) => {
            return client.set("scout_test_key", "scout_test_value")
                .then(() => client.get("scout_test_key"))
                .then(() => done());
        }))
        .catch((err) => {
            client.quit().catch(() => undefined);
            TestUtil.shutdownScout(t, scout, err);
        });
});

test("teardown: stop shared mock agent", (t) => {
    sharedMock.stop().then(() => t.end()).catch(t.end);
});
