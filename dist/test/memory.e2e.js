"use strict";
/**
 * The "test"s in this file are made to test memory leaks while running scout in various environments
 * as such, these tests take a while to run serially
 *
 * These tests should be run either in parallel (via a tool like `bogota`) or by hand
 * and the ENV variable SCOUT_KEY should be provided
 *
 */
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const lib_1 = require("../lib");
lib_1.setupRequireIntegrations(["express"]);
const TestUtil = require("./util");
let PG_CONTAINER_AND_OPTS = null;
let MYSQL_CONTAINER_AND_OPTS = null;
const SCOUT_INSTANCES = [];
// https://github.com/scoutapp/scout_apm_node/issues/239
test("express application launched with scout does not leak memory", { timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS }, t => {
    // TODO: Launch small express application as a subprocess
    // TODO: Perform thousands of requests
    // TODO: Measure subprocess memory usage
});
