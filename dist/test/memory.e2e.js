"use strict";
/**
 * The "test"s in this file are made to test memory leaks while running scout in various environments
 * as such, these tests take a while to run serially, as they do things like sleep until requests would have been sent
 *
 * These tests should be run either in parallel (via a tool like `bogota`) or by hand
 * and the ENV variable SCOUT_KEY should be provided
 *
 */
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const TestUtil = require("./util");
const loadtest_1 = require("loadtest");
const util_1 = require("util");
const loadTest = util_1.promisify(loadtest_1.loadTest);
const LOAD_TEST_CONCURRENCY = parseInt(process.env.LOAD_TEST_CONCURRENCY, 10) || 5;
const LOAD_TEST_RPS = parseInt(process.env.LOAD_TEST_RPS, 10) || 10;
const LOAD_TEST_DURATION_SECONDS = parseInt(process.env.LOAD_TEST_DURATION, 10) || 5;
// https://github.com/scoutapp/scout_apm_node/issues/239
test("express application launched with scout does not leak memory", { timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS }, t => {
    // TODO: Launch small express application as a child process
    // The child process *should* exit after the parent does
    // Set up the load test options
    const randomPort = 12345;
    const options = {
        url: `localhost:${randomPort}`,
        concurrency: LOAD_TEST_CONCURRENCY,
        method: 'GET',
        requestsPerSecond: LOAD_TEST_RPS,
        maxSeconds: LOAD_TEST_DURATION_SECONDS,
    };
    // Perform the load test
    loadTest(options)
        .then(() => {
    })
        .then(() => t.end())
        .catch(t.end);
});
