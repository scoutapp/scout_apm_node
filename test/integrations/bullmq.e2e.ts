import { setupRequireIntegrations } from "../../lib";
setupRequireIntegrations(["bullmq"]);

import { Queue, Worker } from "bullmq";
import * as test from "tape";
import * as TestUtil from "../util";
import { getIntegrationSymbol } from "../../lib/types/integrations";
import { ScoutEvent, buildScoutConfiguration } from "../../lib/types";
import { Scout, ScoutEventRequestSentData } from "../../lib/scout";
import { MockAgent } from "../integration/mock-agent";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);
const TIMEOUT_MS = 15000;
const QUEUE_NAME = "scout-bullmq-test";

const redisConn = { host: REDIS_HOST, port: REDIS_PORT };
const sharedMock = new MockAgent();

test("setup: start shared mock agent", (t) => {
    sharedMock.start().then(() => t.end()).catch(t.end);
});

test("bullmq Worker shim is applied", (t) => {
    t.ok((Worker as any)[getIntegrationSymbol()], "Worker class has integration symbol");
    t.end();
});

test("Job/{name} span is created for a processed job", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new Scout(buildScoutConfiguration({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    const queue = new Queue(QUEUE_NAME, { connection: redisConn });
    let worker: Worker | undefined;

    const cleanup = (err?: any) => {
        const closeQueue = () => queue.close().catch(() => undefined);
        const closeWorker = () => worker ? worker.close().catch(() => undefined) : Promise.resolve();
        return closeWorker()
            .then(closeQueue)
            .then(() => TestUtil.shutdownScout(t, scout, err));
    };

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const jobSpan = spans.find((s) => s.operation === "Job/TestJob");
        if (!jobSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);

        t.ok(jobSpan, "Job/TestJob span present");
        t.equal(jobSpan.operation, "Job/TestJob", "operation is Job/TestJob");

        const queue = jobSpan.getContextValue("queue");
        t.ok(queue, "queue context is set");
        t.equal(queue, QUEUE_NAME, `queue context matches queue name (${QUEUE_NAME})`);

        const taskId = jobSpan.getContextValue("task_id");
        t.ok(taskId !== undefined && taskId !== "", "task_id context is set");

        const queueTimeNs = jobSpan.getContextValue("scout.job_queue_time_ns");
        t.ok(typeof queueTimeNs === "number", "scout.job_queue_time_ns is a number");
        t.ok((queueTimeNs as number) >= 0, "scout.job_queue_time_ns is >= 0");

        const priority = jobSpan.getContextValue("priority");
        t.ok(priority !== undefined, "priority context is set");

        cleanup().catch((err2) => t.end(err2));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => {
            worker = new Worker(
                QUEUE_NAME,
                async (_job) => {
                    await new Promise((r) => setTimeout(r, 50));
                },
                { connection: redisConn },
            );
            return queue.add("TestJob", { hello: "world" });
        })
        .catch(cleanup);
});

test("Job/{name} span with priority context", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new Scout(buildScoutConfiguration({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    const queue = new Queue(QUEUE_NAME, { connection: redisConn });
    let worker: Worker | undefined;

    const cleanup = (err?: any) => {
        const closeQueue = () => queue.close().catch(() => undefined);
        const closeWorker = () => worker ? worker.close().catch(() => undefined) : Promise.resolve();
        return closeWorker()
            .then(closeQueue)
            .then(() => TestUtil.shutdownScout(t, scout, err));
    };

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const jobSpan = spans.find((s) => s.operation === "Job/PriorityJob");
        if (!jobSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);

        const priority = jobSpan.getContextValue("priority");
        t.equal(priority, "5", "priority context reflects enqueued priority (5)");

        cleanup().catch((err2) => t.end(err2));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => {
            worker = new Worker(
                QUEUE_NAME,
                async (_job) => {
                    await new Promise((r) => setTimeout(r, 50));
                },
                { connection: redisConn },
            );
            return queue.add("PriorityJob", {}, { priority: 5 });
        })
        .catch(cleanup);
});

test("error flag set when processor throws", { timeout: TIMEOUT_MS }, (t) => {
    const scout = new Scout(buildScoutConfiguration({
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        socketPath: sharedMock.socketPath(),
    }));

    const queue = new Queue(QUEUE_NAME, { connection: redisConn });
    let worker: Worker | undefined;

    const cleanup = (err?: any) => {
        const closeQueue = () => queue.close().catch(() => undefined);
        const closeWorker = () => worker ? worker.close().catch(() => undefined) : Promise.resolve();
        return closeWorker()
            .then(closeQueue)
            .then(() => TestUtil.shutdownScout(t, scout, err));
    };

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        const jobSpan = spans.find((s) => s.operation === "Job/FailingJob");
        if (!jobSpan) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);

        const errorFlag = jobSpan.getContextValue("error");
        t.equal(errorFlag, "true", "error context is 'true' when processor throws");

        cleanup().catch((err2) => t.end(err2));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    scout.setup()
        .then(() => {
            worker = new Worker(
                QUEUE_NAME,
                async (_job) => {
                    throw new Error("intentional test failure");
                },
                {
                    connection: redisConn,
                    // Don't retry — fail immediately
                    settings: { backoffStrategy: () => 0 },
                },
            );
            // BullMQ won't re-throw to callProcessJob on retry by default;
            // use attempts:1 so it fails without retrying
            return queue.add("FailingJob", {}, { attempts: 1 });
        })
        .catch(cleanup);
});

test("teardown: stop shared mock agent", (t) => {
    sharedMock.stop().then(() => t.end()).catch(t.end);
});
