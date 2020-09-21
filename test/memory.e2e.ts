/**
 * The "test"s in this file are made to test memory leaks while running scout in various environments
 * as such, these tests take a while to run serially, as they do things like sleep until requests would have been sent.
 *
 * NOTE: dist/ must be built and contain the valid lib for this test to work
 *
 * These tests should be run either in parallel (via a tool like `bogota`) or by hand
 * and the ENV variable SCOUT_KEY should be provided
 *
 */

import * as path from "path";
import * as test from "tape";
import * as request from "supertest";
import { generate as generateRandomString } from "randomstring";
import { fork } from "child_process";

const getPort = require("get-port");

import * as TestUtil from "./util";
import * as TestConstants from "./constants";
import { FILE_PATHS } from "./fixtures";

import { loadTest as loadTestCb } from "loadtest";
import { promisify } from "util";

const loadTest = promisify(loadTestCb);

const LOAD_TEST_CONCURRENCY = parseInt(process.env.LOAD_TEST_CONCURRENCY || "5", 10);
const LOAD_TEST_RPS = parseInt(process.env.LOAD_TEST_RPS || "10", 10);
const LOAD_TEST_DURATION_SECONDS = parseInt(process.env.LOAD_TEST_DURATION || "10", 10);

const MEMORY_USAGE_BOUND_MULTIPLIER = 1.25;

const DEFAULT_LOADTEST_OPTIONS = {
    concurrency: LOAD_TEST_CONCURRENCY,
    method: "GET" as const,
    requestsPerSecond: LOAD_TEST_RPS,
    maxSeconds: LOAD_TEST_DURATION_SECONDS,
};

// https://github.com/scoutapp/scout_apm_node/issues/239
test("no large memory leaks", {timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS}, async (t) => {
    // Ensure SCOUT_KEY was provided
    if (!process.env.SCOUT_KEY) {
        const err = new Error("Invalid/missing SCOUT_KEY ENV variable");
        t.end(err);
        throw err;
    }

    // Stats that will get updated later
    const stats = {
        express: {
            memoryUsage: {} as any,
        },
        expressWithScout: {
            memoryUsage: {} as any,
        },
    };

    const testName = `memory-leak-test-${generateRandomString(5)}`;

    // Launch a small express application as a child process *without* scout
    const expressENV = {
        PORT: await getPort(),
        SCOUT_NAME: `${testName}-no-scout`,
    };
    const expressProcess = fork(FILE_PATHS.EXPRESS_APP_PATH, [], {
        env: expressENV,
    });
    expressProcess.on("message", payload => {
        if (!payload) { return; }
        if (typeof payload === "object" && payload.msgType === "memory-usage-report") {
            stats.express.memoryUsage = JSON.parse(payload.memoryUsageJSON);
        }
    });

    // Launch small express application as a child process *with* scout
    const expressWithScoutENV = {
        PORT: await getPort(),
        SCOUT_KEY: process.env.SCOUT_KEY,
        SCOUT_NAME: `${testName}-with-scout`,
    };
    const expressWithScoutProcess = fork(FILE_PATHS.EXPRESS_APP_WITH_SCOUT_PATH, [], {
        env: expressWithScoutENV,
    });
    expressWithScoutProcess.on("message", payload => {
        if (!payload) { return; }
        if (typeof payload === "object" && payload.msgType === "memory-usage-report") {
            stats.expressWithScout.memoryUsage = JSON.parse(payload.memoryUsageJSON);
        }
    });

    // Load test the first application
    await loadTest({
        ...DEFAULT_LOADTEST_OPTIONS,
        url: `http://localhost:${expressENV.PORT}`,
    });

    // Get the memory usage after load testing
    expressProcess.send("report-memory-usage");
    await TestUtil.waitMs(500);

    // Load test the application with express
    await loadTest({
        ...DEFAULT_LOADTEST_OPTIONS,
        url: `http://localhost:${expressWithScoutENV.PORT}`,
    });

    // After performing load test with express, wait 3 mins for messages to get sent
    // await TestUtil.waitMs(60 * 1000 * 3);

    // Get the memory usage after load testing
    expressWithScoutProcess.send("report-memory-usage");
    await TestUtil.waitMs(500);

    // Ensure stats are as we expect
    if (!stats.express.memoryUsage || !stats.express.memoryUsage.heapUsed
        || !stats.expressWithScout.memoryUsage || !stats.expressWithScout.memoryUsage.heapUsed ) {
        const err = new Error("Invalid/missing stats for either express or express with scout");
        t.end(err);
        throw err;
    }

    const memUsage = stats.express.memoryUsage!.heapUsed;
    const memUsageWithScout = stats.expressWithScout.memoryUsage!.heapUsed;
    const ratio = memUsageWithScout / memUsage;

    t.comment(
        `usage with/out scout (${memUsageWithScout.toLocaleString()}B) / (${memUsage.toLocaleString()}B) => ${ratio}`,
    );
    t.assert(
        ratio <= MEMORY_USAGE_BOUND_MULTIPLIER,
        `memoryUsage().heapUsed with scout should be within ${MEMORY_USAGE_BOUND_MULTIPLIER}x of app without scout`,
    );

    // Kill the two child processes
    expressWithScoutProcess.kill();
    expressProcess.kill();

    t.end();
});
