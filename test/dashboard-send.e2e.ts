/**
 * The "test"s in this file are made to send to the dashboard.
 * as such, they all take ~2 minutes to run serially, since they wait for attached core-agent(s) to send data
 *
 * These tests should be run either in parallel (via a tool like `bogota`) or by hand
 * and the ENV variable SCOUT_KEY should be provided
 *
 * NOTE - the tests in here do *NOT* properly shut down the scout instances they use right away,
 * cleanup happens at the end after waiting a certain amount of time to ensure the traces are sent.
 */

import * as test from "tape";
import * as request from "supertest";
import { generate as generateRandomString } from "randomstring";

import {
    AgentLaunchDisabled,
    ApplicationMetadata,
    ExternalDownloadDisallowed,
    LogLevel,
    Scout,
    ScoutEventRequestSentData,
    ScoutRequest,
    ScoutSpan,
    consoleLogFn,
    setupRequireIntegrations,
} from "../lib";

import {
    AgentEvent,
    AgentRequestType,
    BaseAgentRequest,
    ScoutEvent,
    ScoutSpanOperation,
    ScoutContextName,
    buildScoutConfiguration,
} from "../lib/types";

import { V1FinishRequest } from "../lib/protocol/v1/requests";

import { Application } from "express";
import { scoutMiddleware, ApplicationWithScout } from "../lib/express";

import { Client } from "pg";
import { Connection } from "mysql";

import * as TestUtil from "./util";
import * as TestConstants from "./constants";

import { SQL_QUERIES } from "./fixtures";

// let PG_CONTAINER_AND_OPTS: TestUtil.ContainerAndOpts | null = null;
// let MYSQL_CONTAINER_AND_OPTS: TestUtil.ContainerAndOpts | null = null;
const SCOUT_INSTANCES: Scout[] = [];

// Set up the pug integration for the pug dashboard sends
setupRequireIntegrations(["pug"]);
const pug = require("pug");

// https://github.com/scoutapp/scout_apm_node/issues/71
test("Scout sends basic controller span to dashboard", {timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS}, t => {
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        name: TestConstants.TEST_SCOUT_NAME,
    });

    const appMeta = new ApplicationMetadata(config, {frameworkVersion: "test"});

    if (!config.key) {
        throw new Error("No Scout key! Provide one with the SCOUT_KEY ENV variable");
    }

    if (!config.name) {
        throw new Error("No Scout name! Provide one with the SCOUT_NAME ENV variable");
    }

    const scout = new Scout(config, {appMeta});
    SCOUT_INSTANCES.push(scout);

    // Set up a listener to wait for scout to report the transaction
    const listener = (message: BaseAgentRequest) => {
        // Ignore requests that are sent that aren't span starts
        if (!message || message.type !== AgentRequestType.V1FinishRequest) { return; }
        t.pass("Witnessed V1FinishRequest being sent");

        scout.removeListener(ScoutEvent.RequestSent, listener);
        t.end();
    };

    // Set up listener on the agent to listen for the stop request to be sent
    scout.on(AgentEvent.RequestSent, listener);

    const name = `Controller/GET /`;

    scout.transaction(name, (transactionDone) => {
        return scout.instrument(name, () => {
            TestUtil.waitMs(200)
                .then(() => t.pass("wait completed"))
                .then(() => transactionDone())
                .catch(err => t.fail("some error occurred"));
        });
    });
});

//////////////////////////////
// Postgres dashboard sends //
//////////////////////////////

// Pseudo test that will start a containerized postgres instance
TestUtil.startContainerizedPostgresTest(test, cao => {
    PG_CONTAINER_AND_OPTS = cao;
});

// For the postgres integration
// https://github.com/scoutapp/scout_apm_node/issues/83
test("transaction with with postgres DB query to dashboard", {timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS}, t => {
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        name: TestConstants.TEST_SCOUT_NAME,
    });

    const appMeta = new ApplicationMetadata(config, {frameworkVersion: "test"});

    if (!config.key) {
        throw new Error("No Scout key! Provide one with the SCOUT_KEY ENV variable");
    }

    if (!config.name) {
        throw new Error("No Scout name! Provide one with the SCOUT_NAME ENV variable");
    }

    const scout = new Scout(config, {appMeta});
    let client: Client;

    // Set up a listener to wait for scout to report the transaction
    const listener = (message: BaseAgentRequest) => {
        // Ignore requests that are sent that aren't span starts
        if (!message || message.type !== AgentRequestType.V1FinishRequest) { return; }
        t.pass("Witnessed V1FinishRequest being sent");

        scout.removeListener(ScoutEvent.RequestSent, listener);

        client.end(() => t.end());
    };

    // Set up listener on the agent to listen for the stop request to be sent
    scout.on(AgentEvent.RequestSent, listener);

    const name = `Controller/GET /`;

    scout.transaction(name, (transactionDone) => {
        return scout.instrument(name, (spanDone) => {
            TestUtil
            // Connect a PG client
                .makeConnectedPGClient(() => PG_CONTAINER_AND_OPTS)
                .then(c => client = c)
            // Do a query
                .then(() => {
                    return client
                        .query(SQL_QUERIES.SELECT_TIME)
                        .then(() => t.comment("performed query"));
                })
            // Finish the span
                .then(() => spanDone())
                .then(() => t.pass("span finished"))
            // Finish the transaction
                .then(() => transactionDone())
                .then(() => t.pass("db transaction finished"))
            // If an error happens then shutdown the DB client and end test
                .catch(err => {
                    t.fail("some error occurred");

                    if (client) { client.end(); }
                });
        });
    })
        .catch(err => {
            if (client) { client.end(); }
        });
});

// Pseudo test that will stop a containerized postgres instance that was started
TestUtil.stopContainerizedPostgresTest(test, () => PG_CONTAINER_AND_OPTS);

///////////////////////////
// MySQL dashboard sends //
///////////////////////////

// Pseudo test that will start a containerized mysql instance
TestUtil.startContainerizedMySQLTest(test, cao => {
    MYSQL_CONTAINER_AND_OPTS = cao;
});

test("transaction with mysql query to dashboard", {timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS}, t => {
    // Build scout config & app meta for test
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        name: TestConstants.TEST_SCOUT_NAME,
    });
    if (!config.key) { throw new Error("No Scout key! Provide one with the SCOUT_KEY ENV variable"); }
    if (!config.name) { throw new Error("No Scout name! Provide one with the SCOUT_NAME ENV variable"); }

    const appMeta = new ApplicationMetadata(config, {frameworkVersion: "test"});

    // Build scout instance, get ready to hold an active mysql connection
    const scout = new Scout(config, {appMeta});
    let conn: Connection;

    // Set up a listener to wait for scout to report the transaction
    const listener = (message: BaseAgentRequest) => {
        // Ignore requests that are sent that aren't span starts
        if (!message || message.type !== AgentRequestType.V1FinishRequest) { return; }
        t.pass("witnessed V1FinishRequest being sent");

        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Fire off disconnect
        conn.end(() => t.end());
    };

    // Set up listener on the agent to listen for the stop request to be sent
    scout.on(AgentEvent.RequestSent, listener);

    const name = `Controller/GET /`;

    scout
        .setup()
    // Run the transaction
        .then(() => scout.transaction(name, (transactionDone) => {
            return scout.instrument(name, (spanDone) => {
                return TestUtil.makeConnectedMySQLConnection(() => MYSQL_CONTAINER_AND_OPTS)
                    .then(c => conn = c)
                    .then(() => new Promise((resolve, reject) => {
                        // mysql's query function needs to be wrapped in a promise
                        conn.query(SQL_QUERIES.SELECT_TIME, (err, result) => {
                            if (err) {
                                reject(err);
                                return;
                            }

                            t.pass("query performed");
                            // End the span and the request
                            spanDone();
                            transactionDone();
                            resolve(result);
                        });
                    }));
            });
        }))
    // If an error occurs shutdown scout and end connection
        .catch(err => {
            if (conn) {
                conn.end();
            }
        });
});

test("transaction with mysql2 query to dashboard", {timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS}, t => {
    // Build scout config & app meta for test
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        name: TestConstants.TEST_SCOUT_NAME,
    });
    if (!config.key) { throw new Error("No Scout key! Provide one with the SCOUT_KEY ENV variable"); }
    if (!config.name) { throw new Error("No Scout name! Provide one with the SCOUT_NAME ENV variable"); }

    const appMeta = new ApplicationMetadata(config, {frameworkVersion: "test"});

    // Build scout instance, get ready to hold an active mysql connection
    const scout = new Scout(config, {appMeta});
    let conn: Connection;

    // Set up a listener to wait for scout to report the transaction
    const listener = (message: BaseAgentRequest) => {
        // Ignore requests that are sent that aren't span starts
        if (!message || message.type !== AgentRequestType.V1FinishRequest) { return; }
        t.pass("witnessed V1FinishRequest being sent");

        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Fire off disconnect
        conn.end(() => t.end());
    };

    // Set up listener on the agent to listen for the stop request to be sent
    scout.on(AgentEvent.RequestSent, listener);

    const name = `Controller/GET /`;

    scout
        .setup()
    // Run the transaction
        .then(() => scout.transaction(name, (transactionDone) => {
            return scout.instrument(name, (spanDone) => {
                return TestUtil.makeConnectedMySQL2Connection(() => MYSQL_CONTAINER_AND_OPTS)
                    .then(c => conn = c)
                    .then(() => new Promise((resolve, reject) => {
                        // mysql's query function needs to be wrapped in a promise
                        conn.query(SQL_QUERIES.SELECT_TIME, (err, result) => {
                            if (err) {
                                reject(err);
                                return;
                            }

                            t.pass("query performed");
                            // End the span and the request
                            spanDone();
                            transactionDone();
                            resolve(result);
                        });
                    }));
            });
        }))
    // If an error occurs shutdown scout and end connection
        .catch(err => {
            if (conn) {
                conn.end();
            }
        });
});

// Pseudo test that will stop a containerized mysql instance that was started
TestUtil.stopContainerizedMySQLTest(test, () => MYSQL_CONTAINER_AND_OPTS);

/////////////////////////////////////////
// Express integration dashboard sends //
/////////////////////////////////////////

// https://github.com/scoutapp/scout_apm_node/issues/82
test("Express pug integration dashboard send", {timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS}, t => {
    // Build scout config & app meta for test
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        name: TestConstants.TEST_SCOUT_NAME,
    });
    if (!config.key) { throw new Error("No Scout key! Provide one with the SCOUT_KEY ENV variable"); }
    if (!config.name) { throw new Error("No Scout name! Provide one with the SCOUT_NAME ENV variable"); }

    const scout = new Scout(config);
    const appMeta = new ApplicationMetadata(config, {frameworkVersion: "test"});

    // Create an application that's set up to use pug templating
    const app: Application & ApplicationWithScout = TestUtil.simpleHTML5BoilerplateApp(scoutMiddleware({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }), "pug");

    // Set up a listener that should fire when the request is finished
    const listener = (data: ScoutEventRequestSentData, another) => {
        // Remove listener since this should fire once
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Look up the template render span from the request
        const requestSpans = data.request.getChildSpansSync();
        t.equals(requestSpans.length, 1, "There's one span on the request (the Controller/)");

        // The top level controller should be present
        const controllerSpan = requestSpans.find(s => s.operation.includes("Controller/"));
        t.assert(controllerSpan, "template controller span was present on request");
        if (!controllerSpan) {
            t.fail("no controller span present on request");
            throw new Error("No controller span");
        }

        // The inner spans for the controller should contain a template rendering span
        const innerSpans = controllerSpan.getChildSpansSync();
        const renderSpan = innerSpans.find(s => s.operation === ScoutSpanOperation.TemplateRender);
        t.assert(renderSpan, "template render span was present on request");
        if (!renderSpan) {
            t.fail("no render span present on request");
            throw new Error("No render span");
        }

        t.assert(renderSpan.getContextValue(ScoutContextName.Name), "template name context is present");

        t.end();
    };

    scout.on(ScoutEvent.RequestSent, listener);

    return request(app)
        .get("/")
        .expect("Content-Type", /html/)
        .expect(200)
        .then(res => {
            t.assert(res.text.includes("<title>dynamic</title>"), "dynamic template was rendered by express");
        });
});

// https://github.com/scoutapp/scout_apm_node/issues/82
test("Test scout app launch dashboard send", {timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS}, t => {
    // Build scout config & app meta for test
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        name: TestConstants.TEST_SCOUT_NAME,
    });
    if (!config.key) { throw new Error("No Scout key! Provide one with the SCOUT_KEY ENV variable"); }
    if (!config.name) { throw new Error("No Scout name! Provide one with the SCOUT_NAME ENV variable"); }

    const sha = generateRandomString(64);
    config.revisionSHA = sha;
    t.comment(`set revision sha to ${sha}`);

    // Generate generic app metadata
    const appMeta = new ApplicationMetadata(config, {frameworkVersion: "test"});

    // Create scout instance, save it in the list of instances to be removed at test-suite end
    const scout = new Scout(config, {appMeta});
    SCOUT_INSTANCES.push(scout);

    // Create a simple application and setup scout middleware
    const app: Application & ApplicationWithScout = TestUtil.simpleExpressApp(scoutMiddleware({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }));

    // Set up a listener that should fire when the request is finished
    const listener = (data: ScoutEventRequestSentData, another) => {
        // Remove listener since this should fire once
        scout.removeListener(ScoutEvent.RequestSent, listener);
        t.ok("request was sent to scout instance");
        t.end();
    };

    scout.on(ScoutEvent.RequestSent, listener);

    // Simply performing a request to he application should cause the creation & setup of the scout instance
    // app metadata should be automatically sent (along with the randomized SHA which should indicate a change)
    return request(app)
        .get("/")
        .expect("Content-Type", /json/)
        .expect(200)
        .then(res => t.ok("request was sent to simple express app"));
});

// Shutdown all the scout instances after waiting what we expect should be enough time to send the tests
test("wait and shutdown all scout instances", t => {
    // Wait ~2 minutes for request to be sent to scout in the cloud then shutdown
        TestUtil.waitMinutes(2)
        .then(() => t.comment(`shutting down [${SCOUT_INSTANCES.length}] scout instances...`))
        .then(() =>  Promise.all(SCOUT_INSTANCES.map(s => TestUtil.shutdownScout(t, s))))
        .then(() => t.pass("all scout instances were shut down"))
        .catch(t.end);
});
