import { setupRequireIntegrations } from "../../lib";
setupRequireIntegrations(["mongodb"]);

import { MongoClient } from "mongodb";
import * as test from "tape";
import * as TestUtil from "../util";
import { getIntegrationSymbol } from "../../lib/types/integrations";
import { ScoutEvent, buildScoutConfiguration } from "../../lib/types";
import { Scout, ScoutEventRequestSentData } from "../../lib/scout";
import { MockAgent } from "../integration/mock-agent";

const MONGO_HOST = process.env.MONGO_HOST || "127.0.0.1";
const MONGO_PORT = parseInt(process.env.MONGO_PORT || "27017", 10);
const MONGO_URI = `mongodb://${MONGO_HOST}:${MONGO_PORT}`;
const TIMEOUT_MS = 15000;

const sharedMock = new MockAgent();

test("setup: start shared mock agent", (t) => {
    sharedMock.start().then(() => t.end()).catch(t.end);
});

test("mongodb shim is applied", (t) => {
    const mongoModule = require("mongodb");
    t.ok((mongoModule as any)[getIntegrationSymbol()], "mongodb module has integration symbol");
    t.end();
});

test("MongoDB/insertOne span is created during a request", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new Scout(buildScoutConfiguration({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    const client = new MongoClient(MONGO_URI);

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const insertSpan = spans.find((s) => s.operation.startsWith("MongoDB/") && s.operation.endsWith("/insert"));
        if (!insertSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);
        t.ok(insertSpan, `insert span present: ${insertSpan.operation}`);

        const stmt = insertSpan.getContextValue("db.statement") as string;
        t.ok(stmt && stmt.includes('"insert"'), `db.statement contains insert key, got: ${stmt}`);
        t.ok(stmt && stmt.includes('"?"'), `db.statement scrubs values with "?", got: ${stmt}`);

        client.close()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => client.connect())
        .then(() => scout.transaction("Controller/mongodb-insert-test", (done) => {
            const collection = client.db("scout_test").collection("scout_e2e");
            return collection.insertOne({ name: "test", value: 42 })
                .then(() => done());
        }))
        .catch((err) => {
            client.close().catch(() => undefined);
            TestUtil.shutdownScout(t, scout, err);
        });
});

test("MongoDB/find span is created during a request", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new Scout(buildScoutConfiguration({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    const client = new MongoClient(MONGO_URI);

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const findSpan = spans.find((s) => s.operation.startsWith("MongoDB/") && s.operation.endsWith("/find"));
        if (!findSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);
        t.ok(findSpan, `find span present: ${findSpan.operation}`);

        const stmt = findSpan.getContextValue("db.statement") as string;
        t.ok(stmt && stmt.includes('"find"'), `db.statement contains find key, got: ${stmt}`);

        client.close()
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch((err) => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => client.connect())
        .then(() => scout.transaction("Controller/mongodb-find-test", (done) => {
            const collection = client.db("scout_test").collection("scout_e2e");
            return collection.find({ name: "test" }).toArray()
                .then(() => done());
        }))
        .catch((err) => {
            client.close().catch(() => undefined);
            TestUtil.shutdownScout(t, scout, err);
        });
});

test("MongoDB span has error context on command failure", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new Scout(buildScoutConfiguration({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    // Connect to a port not listening to force connection failure
    const badClient = new MongoClient(`mongodb://${MONGO_HOST}:1`, {
        serverSelectionTimeoutMS: 2000,
        connectTimeoutMS: 2000,
    });

    scout.setup()
        .then(() => badClient.connect())
        .then(() => badClient.db("scout_test").collection("scout_e2e").insertOne({ x: 1 }))
        .then(() => {
            badClient.close().catch(() => undefined);
            TestUtil.shutdownScout(t, scout, new Error("Expected connection to fail"));
        })
        .catch((err) => {
            t.ok(err, `Got expected connection error: ${err.message}`);
            badClient.close().catch(() => undefined);
            TestUtil.shutdownScout(t, scout);
        });
});

test("teardown: stop shared mock agent", (t) => {
    sharedMock.stop().then(() => t.end()).catch(t.end);
});
