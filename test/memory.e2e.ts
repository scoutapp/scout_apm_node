/**
 * The "test"s in this file are made to test memory leaks while running scout in various environments
 * as such, these tests take a while to run serially
 *
 * These tests should be run either in parallel (via a tool like `bogota`) or by hand
 * and the ENV variable SCOUT_KEY should be provided
 *
 */

import * as test from "tape";
import * as request from "supertest";
import { generate as generateRandomString } from "randomstring";

import {
    ApplicationMetadata,
    LogLevel,
    consoleLogFn,
    AgentEvent,
    AgentRequestType,
    BaseAgentRequest,
    ScoutEvent,
    ScoutSpanOperation,
    ScoutContextName,
    buildScoutConfiguration,
} from "../lib/types";

import { setupRequireIntegrations } from "../lib";

setupRequireIntegrations(["express"]);

import {
    ExternalDownloadDisallowed,
    AgentLaunchDisabled,
} from "../lib/errors";

import {
    Scout,
    ScoutRequest,
    ScoutSpan,
    ScoutEventRequestSentData,
} from "../lib/scout";

import { V1FinishRequest } from "../lib/protocol/v1/requests";

import { Application } from "express";
import { scoutMiddleware, ApplicationWithScout } from "../lib/express";

import { Client } from "pg";
import { Connection } from "mysql";

import * as TestUtil from "./util";
import * as TestConstants from "./constants";

import { SQL_QUERIES } from "./fixtures";

import { loadTest } from "loadtest";

let PG_CONTAINER_AND_OPTS: TestUtil.ContainerAndOpts | null = null;
let MYSQL_CONTAINER_AND_OPTS: TestUtil.ContainerAndOpts | null = null;
const SCOUT_INSTANCES: Scout[] = [];

// https://github.com/scoutapp/scout_apm_node/issues/239
test("express application launched with scout does not leak memory", {timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS}, t => {
    // TODO: Launch small express application as a subprocess

    // TODO: Perform thousands of requests

    // TODO: Measure subprocess memory usage
});
