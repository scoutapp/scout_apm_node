/**
 * The "test"s in this file are made to send to the dashboard.
 * as such, they all take ~2 minutes to run serially, since they wait for attached core-agent(s) to send data
 *
 * These tests should be run either in parallel (via a tool like `bogota`) or by hand
 * and the ENV variable SCOUT_KEY should be provided
 */

import * as test from "tape";
import * as request from "supertest";

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
    ScoutContextNames,
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

let PG_CONTAINER_AND_OPTS: TestUtil.ContainerAndOpts | null = null;
let MYSQL_CONTAINER_AND_OPTS: TestUtil.ContainerAndOpts | null = null;

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

    // Set up a listener to wait for scout to report the transaction
    const listener = (message: BaseAgentRequest) => {
        // Ignore requests that are sent that aren't span starts
        if (!message || message.type !== AgentRequestType.V1FinishRequest) { return; }
        t.pass("Witnessed V1FinishRequest being sent");

        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Wait ~2 minutes for request to be sent to scout in the cloud then shutdown
        TestUtil.waitMinutes(2)
            .then(() => TestUtil.shutdownScout(t, scout));
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
    })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
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

        // Wait ~2 minutes for request to be sent to scout in the cloud then shutdown
        TestUtil.waitMinutes(2)
            .then(() => client.end())
            .then(() => TestUtil.shutdownScout(t, scout));
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

                    (client ? client.end() : Promise.resolve())
                        .then(() => TestUtil.shutdownScout(t, scout, err));
                });
        });
    })
        .catch(err => {
            (client ? client.end() : Promise.resolve())
                .then(() => TestUtil.shutdownScout(t, scout, err));
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
        conn.end(() => {
            // Wait ~2 minutes for scout to clear requests
            TestUtil.waitMinutes(2)
                .then(() => TestUtil.shutdownScout(t, scout));
        });
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
                conn.end(() => {
                    TestUtil.shutdownScout(t, scout, err);
                });
            }

            TestUtil.shutdownScout(t, scout, err);
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
        conn.end(() => {
            // Wait ~2 minutes for scout to clear requests
            TestUtil.waitMinutes(2)
                .then(() => TestUtil.shutdownScout(t, scout));
        });
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
                conn.end(() => {
                    TestUtil.shutdownScout(t, scout, err);
                });
            }

            TestUtil.shutdownScout(t, scout, err);
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

        t.assert(renderSpan.getContextValue(ScoutContextNames.Name), "template name context is present");

        // Wait ~2 minutes for request to be sent to scout in the cloud then shutdown
        TestUtil.waitMinutes(2)
            .then(() => TestUtil.shutdownScout(t, scout));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    return request(app)
        .get("/")
        .expect("Content-Type", /html/)
        .expect(200)
        .then(res => {
            t.assert(res.text.includes("<title>dynamic</title>"), "dynamic template was rendered by express");
        })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
