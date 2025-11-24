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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tape_1 = __importDefault(require("tape"));
const randomstring_1 = require("randomstring");
const child_process_1 = require("child_process");
const getPort = require("get-port");
const TestUtil = __importStar(require("./util"));
const fixtures_1 = require("./fixtures");
const loadtest_1 = require("loadtest");
const util_1 = require("util");
const loadTest = (0, util_1.promisify)(loadtest_1.loadTest);
const LOAD_TEST_CONCURRENCY = parseInt(process.env.LOAD_TEST_CONCURRENCY || "5", 10);
const LOAD_TEST_RPS = parseInt(process.env.LOAD_TEST_RPS || "20", 10);
const LOAD_TEST_DURATION_SECONDS = parseInt(process.env.LOAD_TEST_DURATION || "120", 10);
let MEM_USAGE_BOUND_MULTIPLIER = 2; // heuristics-based
let MEM_USAGE_LIMIT_MB = 16; // heuristics-based
// FRAGILE: when in CI, memory usage settles around 24MB and 3x after 60s
if (process.env.CI) {
    MEM_USAGE_BOUND_MULTIPLIER = 4.5; // heuristics-based
    MEM_USAGE_LIMIT_MB = 40; // heuristics-based
}
const DEFAULT_LOADTEST_OPTIONS = {
    concurrency: LOAD_TEST_CONCURRENCY,
    method: "GET",
    requestsPerSecond: LOAD_TEST_RPS,
    maxSeconds: LOAD_TEST_DURATION_SECONDS,
};
// https://github.com/scoutapp/scout_apm_node/issues/239
(0, tape_1.default)("no large memory leaks", { timeout: TestUtil.MEMORY_LEAK_TEST_TIMEOUT_MS }, async (t) => {
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
    const testName = `memory-leak-test-${(0, randomstring_1.generate)(5)}`;
    // Launch a small express application as a child process *without* scout
    const expressENV = {
        PORT: await getPort(),
        SCOUT_NAME: `${testName}-no-scout`,
    };
    const expressProcess = (0, child_process_1.fork)(fixtures_1.FILE_PATHS.EXPRESS_APP_PATH, [], {
        env: expressENV,
    });
    t.comment(`app without scout started (PID: [${expressProcess.pid}])`);
    expressProcess.on("message", payload => {
        if (!payload) {
            return;
        }
        if (typeof payload === "object" && 'msgType' in payload && payload.msgType === "memory-usage-report") {
            stats.express.memoryUsage = JSON.parse(payload.memoryUsageJSON);
        }
    });
    // Launch small express application as a child process *with* scout
    const expressWithScoutENV = {
        PORT: await getPort(),
        SCOUT_KEY: process.env.SCOUT_KEY,
        SCOUT_NAME: `${testName}-with-scout`,
    };
    const expressWithScoutProcess = (0, child_process_1.fork)(fixtures_1.FILE_PATHS.EXPRESS_APP_WITH_SCOUT_PATH, [], {
        env: expressWithScoutENV,
    });
    t.comment(`app with scout started (PID: [${expressWithScoutProcess.pid}])`);
    expressWithScoutProcess.on("message", payload => {
        if (!payload) {
            return;
        }
        if (typeof payload === "object" && 'msgType' in payload && payload.msgType === "memory-usage-report") {
            stats.expressWithScout.memoryUsage = JSON.parse(payload.memoryUsageJSON);
        }
    });
    // Load test the first application (without scout)
    await loadTest({
        ...DEFAULT_LOADTEST_OPTIONS,
        url: `http://localhost:${expressENV.PORT}`,
    });
    // Get the memory usage after load testing
    expressProcess.send("report-memory-usage");
    await TestUtil.waitMs(100);
    // Load test the application with scout
    await loadTest({
        ...DEFAULT_LOADTEST_OPTIONS,
        url: `http://localhost:${expressWithScoutENV.PORT}`,
    });
    // Get the memory usage after load testing
    expressWithScoutProcess.send("report-memory-usage");
    await TestUtil.waitMs(100);
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
});
