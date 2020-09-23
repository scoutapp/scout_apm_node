"use strict";
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const randomstring_1 = require("randomstring");
const child_process_1 = require("child_process");
const getPort = require("get-port");
const TestUtil = require("./util");
const fixtures_1 = require("./fixtures");
const loadtest_1 = require("loadtest");
const util_1 = require("util");
const loadTest = util_1.promisify(loadtest_1.loadTest);
const LOAD_TEST_CONCURRENCY = parseInt(process.env.LOAD_TEST_CONCURRENCY || "5", 10);
const LOAD_TEST_RPS = parseInt(process.env.LOAD_TEST_RPS || "20", 10);
const LOAD_TEST_DURATION_SECONDS = parseInt(process.env.LOAD_TEST_DURATION || "120", 10);
const MEM_USAGE_BOUND_MULTIPLIER = 2; // heuristics-based
const MEM_USAGE_LIMIT_MB = 16; // heuristics-based
const DEFAULT_LOADTEST_OPTIONS = {
    concurrency: LOAD_TEST_CONCURRENCY,
    method: "GET",
    requestsPerSecond: LOAD_TEST_RPS,
    maxSeconds: LOAD_TEST_DURATION_SECONDS,
};
// https://github.com/scoutapp/scout_apm_node/issues/239
test("no large memory leaks", { timeout: TestUtil.MEMORY_LEAK_TEST_TIMEOUT_MS }, (t) => __awaiter(void 0, void 0, void 0, function* () {
    // Ensure SCOUT_KEY was provided
    if (!process.env.SCOUT_KEY) {
        const err = new Error("Invalid/missing SCOUT_KEY ENV variable");
        t.end(err);
        throw err;
    }
    // Stats that will get updated later
    const stats = {
        express: {
            memoryUsage: {},
        },
        expressWithScout: {
            memoryUsage: {},
        },
    };
    const testName = `memory-leak-test-${randomstring_1.generate(5)}`;
    // Launch a small express application as a child process *without* scout
    const expressENV = {
        PORT: yield getPort(),
        SCOUT_NAME: `${testName}-no-scout`,
    };
    const expressProcess = child_process_1.fork(fixtures_1.FILE_PATHS.EXPRESS_APP_PATH, [], {
        env: expressENV,
    });
    t.comment(`app without scout started (PID: [${expressProcess.pid}])`);
    expressProcess.on("message", payload => {
        if (!payload) {
            return;
        }
        if (typeof payload === "object" && payload.msgType === "memory-usage-report") {
            stats.express.memoryUsage = JSON.parse(payload.memoryUsageJSON);
        }
    });
    // Launch small express application as a child process *with* scout
    const expressWithScoutENV = {
        PORT: yield getPort(),
        SCOUT_KEY: process.env.SCOUT_KEY,
        SCOUT_NAME: `${testName}-with-scout`,
    };
    const expressWithScoutProcess = child_process_1.fork(fixtures_1.FILE_PATHS.EXPRESS_APP_WITH_SCOUT_PATH, [], {
        env: expressWithScoutENV,
    });
    t.comment(`app with scout started (PID: [${expressWithScoutProcess.pid}])`);
    expressWithScoutProcess.on("message", payload => {
        if (!payload) {
            return;
        }
        if (typeof payload === "object" && payload.msgType === "memory-usage-report") {
            stats.expressWithScout.memoryUsage = JSON.parse(payload.memoryUsageJSON);
        }
    });
    // Load test the first application (without scout)
    yield loadTest(Object.assign(Object.assign({}, DEFAULT_LOADTEST_OPTIONS), { url: `http://localhost:${expressENV.PORT}` }));
    // Get the memory usage after load testing
    expressProcess.send("report-memory-usage");
    yield TestUtil.waitMs(100);
    // Load test the application with scout
    yield loadTest(Object.assign(Object.assign({}, DEFAULT_LOADTEST_OPTIONS), { url: `http://localhost:${expressWithScoutENV.PORT}` }));
    // Get the memory usage after load testing
    expressWithScoutProcess.send("report-memory-usage");
    yield TestUtil.waitMs(100);
    // Ensure stats are as we expect
    if (!stats.express.memoryUsage || !stats.express.memoryUsage.heapUsed
        || !stats.expressWithScout.memoryUsage || !stats.expressWithScout.memoryUsage.heapUsed) {
        const err = new Error("Invalid/missing stats for either express or express with scout");
        t.end(err);
        throw err;
    }
    const memUsage = stats.express.memoryUsage.heapUsed;
    const memUsageWithScout = stats.expressWithScout.memoryUsage.heapUsed;
    const ratio = memUsageWithScout / memUsage;
    const withinHardLimit = memUsageWithScout <= MEM_USAGE_LIMIT_MB * 1000 * 1000;
    const withinRatio = ratio <= MEM_USAGE_BOUND_MULTIPLIER;
    t.comment(`usage with/out scout (${memUsageWithScout.toLocaleString()}B) / (${memUsage.toLocaleString()}B) => ${ratio}`);
    t.assert(withinHardLimit || withinRatio, `memory usage with scout should be below ${MEM_USAGE_LIMIT_MB}MB, or within ${MEM_USAGE_BOUND_MULTIPLIER}x`);
    // Kill the two child processes
    expressWithScoutProcess.kill();
    expressProcess.kill();
    t.end();
}));
