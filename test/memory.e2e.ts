/**
 * The "test"s in this file are made to test memory leaks while running scout in various environments
 * as such, these tests take a while to run serially, as they do things like sleep until requests would have been sent
 *
 * These tests should be run either in parallel (via a tool like `bogota`) or by hand
 * and the ENV variable SCOUT_KEY should be provided
 *
 */

import * as test from "tape";
import * as request from "supertest";
import { generate as generateRandomString } from "randomstring";

import * as TestUtil from "./util";
import * as TestConstants from "./constants";

import { loadTest as loadTestCb } from "loadtest";
import { promisify } from "util";

const loadTest = promisify(loadTestCb);

const LOAD_TEST_CONCURRENCY = parseInt(process.env.LOAD_TEST_CONCURRENCY || "5", 10);
const LOAD_TEST_RPS = parseInt(process.env.LOAD_TEST_RPS || "10", 10);
const LOAD_TEST_DURATION_SECONDS = parseInt(process.env.LOAD_TEST_DURATION || "5", 10);

// https://github.com/scoutapp/scout_apm_node/issues/239
test("express application launched with scout does not leak memory", {timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS}, t => {
    // TODO: Launch small express application as a child process
    // The child process *should* exit after the parent does

    // TODO: Perform a handful of requests

    // TODO: Get the "baseline" memory usage

    // Set up the load test options
    const randomPort = 12345;
    const options = {
        url: `localhost:${randomPort}`,
        concurrency: LOAD_TEST_CONCURRENCY,
        method: "GET" as const,
        requestsPerSecond: LOAD_TEST_RPS,
        maxSeconds: LOAD_TEST_DURATION_SECONDS,
        // requestGenerator: (params, options, client, callback) => {}
    };

    // Perform the load test
    loadTest(options)
        .then(() => {
            // TODO: check that memory usage stayed within 1.5x
        })
    // Shutdown the child process process
        .then(() => t.end())
        .catch(t.end);
});
