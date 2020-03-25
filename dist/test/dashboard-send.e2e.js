"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const request = require("supertest");
const randomstring_1 = require("randomstring");
const types_1 = require("../lib/types");
const lib_1 = require("../lib");
lib_1.setupRequireIntegrations(["pg", "ejs", "pug"]);
const scout_1 = require("../lib/scout");
const express_1 = require("../lib/express");
const TestUtil = require("./util");
const TestConstants = require("./constants");
const fixtures_1 = require("./fixtures");
let PG_CONTAINER_AND_OPTS = null;
let MYSQL_CONTAINER_AND_OPTS = null;
const SCOUT_INSTANCES = [];
// Set up the pug integration for the pug dashboard sends
const ejs = require("ejs");
const pug = require("pug");
// https://github.com/scoutapp/scout_apm_node/issues/82
test("Test scout app launch dashboard send", { timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS }, t => {
    // Build scout config & app meta for test
    const config = types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        name: TestConstants.TEST_SCOUT_NAME,
    });
    if (!config.key) {
        throw new Error("No Scout key! Provide one with the SCOUT_KEY ENV variable");
    }
    if (!config.name) {
        throw new Error("No Scout name! Provide one with the SCOUT_NAME ENV variable");
    }
    const sha = randomstring_1.generate(64);
    config.revisionSHA = sha;
    t.comment(`set revision sha to ${sha}`);
    // Generate generic app metadata
    const appMeta = new types_1.ApplicationMetadata(config, { frameworkVersion: "test" });
    // Create scout instance, save it in the list of instances to be removed at test-suite end
    const scout = new scout_1.Scout(config, { appMeta });
    SCOUT_INSTANCES.push(scout);
    // Create a simple application and setup scout middleware
    const app = TestUtil.simpleExpressApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
    }));
    // Set up a listener that should fire when the request is finished
    const listener = (data, another) => {
        // Remove listener since this should fire once
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        t.pass("request was sent to scout instance");
        t.end();
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    // Simply performing a request to he application should cause the creation & setup of the scout instance
    // app metadata should be automatically sent (along with the randomized SHA which should indicate a change)
    return request(app)
        .get("/")
        .expect("Content-Type", /json/)
        .expect(200)
        .then(res => t.pass("request was sent to simple express app"));
});
// https://github.com/scoutapp/scout_apm_node/issues/71
test("Scout sends basic controller span to dashboard", { timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS }, t => {
    const config = types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        name: TestConstants.TEST_SCOUT_NAME,
    });
    const appMeta = new types_1.ApplicationMetadata(config, { frameworkVersion: "test" });
    if (!config.key) {
        throw new Error("No Scout key! Provide one with the SCOUT_KEY ENV variable");
    }
    if (!config.name) {
        throw new Error("No Scout name! Provide one with the SCOUT_NAME ENV variable");
    }
    const scout = new scout_1.Scout(config, { appMeta });
    SCOUT_INSTANCES.push(scout);
    // Set up a listener to wait for scout to report the transaction
    const listener = (message) => {
        // Ignore requests that are sent that aren't span starts
        if (!message || message.type !== types_1.AgentRequestType.V1FinishRequest) {
            return;
        }
        t.pass("Witnessed V1FinishRequest being sent");
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        t.end();
    };
    // Set up listener on the agent to listen for the stop request to be sent
    scout.on(types_1.AgentEvent.RequestSent, listener);
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
test("transaction with with postgres DB query to dashboard", { timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS }, t => {
    const config = types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        name: TestConstants.TEST_SCOUT_NAME,
    });
    const appMeta = new types_1.ApplicationMetadata(config, { frameworkVersion: "test" });
    if (!config.key) {
        throw new Error("No Scout key! Provide one with the SCOUT_KEY ENV variable");
    }
    if (!config.name) {
        throw new Error("No Scout name! Provide one with the SCOUT_NAME ENV variable");
    }
    const scout = new scout_1.Scout(config, { appMeta });
    SCOUT_INSTANCES.push(scout);
    let client;
    // Set up a listener to wait for scout to report the transaction
    const listener = (message) => {
        // Ignore requests that are sent that aren't span starts
        if (!message || message.type !== types_1.AgentRequestType.V1FinishRequest) {
            return;
        }
        t.pass("Witnessed V1FinishRequest being sent");
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        client.end(() => t.end());
    };
    // Set up listener on the agent to listen for the stop request to be sent
    scout.on(types_1.AgentEvent.RequestSent, listener);
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
                    .query(fixtures_1.SQL_QUERIES.SELECT_TIME)
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
                t.fail(`An error occurred: ${err.message}`);
                if (client) {
                    client.end();
                }
            });
        });
    })
        .catch(err => {
        if (client) {
            client.end();
        }
    });
});
// https://github.com/scoutapp/scout_apm_node/issues/140
test("Many SELECTs and render", { timeout: TestUtil.PG_TEST_TIMEOUT_MS * 1000 }, t => {
    const config = types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });
    const appMeta = new types_1.ApplicationMetadata(config, { frameworkVersion: "test" });
    const scout = new scout_1.Scout(config, { appMeta });
    SCOUT_INSTANCES.push(scout);
    // Setup a PG Client that we'll use later
    let client;
    // Set up a listener for the scout request that will be sent for the endpoint being hit
    const listener = (data) => {
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Look up the database span from the request
        const requestSpans = data.request.getChildSpansSync();
        const controllerSpan = requestSpans.find(s => s.operation.includes("Controller/"));
        if (!controllerSpan) {
            t.fail("no ControllerSpan span");
            throw new Error("No DB Span");
        }
        const innerSpans = controllerSpan.getChildSpansSync();
        // Check for the inner SQL query spans
        const dbSpans = innerSpans.filter(s => s.operation === types_1.ScoutSpanOperation.SQLQuery);
        t.assert(dbSpans, `db spans [${dbSpans.length}] were present on request`);
        if (!dbSpans || dbSpans.length === 0) {
            t.fail("no DB spans present on request");
            throw new Error("No DB spans");
        }
        // All the DB spans should have the controllerSpan as parent
        t.assert(dbSpans.every(s => s.parent && s.parent.id === controllerSpan.id), "db spans have controller as parent");
        // Check for the inner render spans
        const renderSpans = innerSpans.filter(s => s.operation === types_1.ScoutSpanOperation.TemplateRender);
        t.assert(renderSpans, `render spans [${renderSpans.length}] were present on request`);
        t.equals(renderSpans.length, 1, "only one render span is present");
        const renderSpan = renderSpans[0];
        if (!renderSpan) {
            t.fail("no render span present on request");
            throw new Error("No Render span");
        }
        // Ensure controller span has controller as parent
        t.assert(renderSpan.parent && renderSpan.parent.id === controllerSpan.id, "render span has controller as parent");
        // Check that none of the SQL query spans overlap with the render span
        t.assert(dbSpans.every(dbSpan => dbSpan.getEndTime() <= renderSpan.getTimestamp()), "All DB spans end before the render span starts");
        // Close the PG client & shutdown
        client.end()
            .then(() => t.end());
    };
    let app;
    // Activate the listener
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Connect to the postgres
        .then(() => TestUtil.makeConnectedPGClient(() => PG_CONTAINER_AND_OPTS))
        .then(c => client = c)
        // Build the app with the postgres client
        .then(() => {
        // Create an application will do many queries and render something using ejs
        app = TestUtil.queryAndRenderRandomNumbers(express_1.scoutMiddleware({
            scout,
            requestTimeoutMs: 0,
        }), "ejs", client);
    })
        // Perform the request to trigger the queries & render
        .then(() => {
        return request(app)
            .get("/")
            .expect("Content-Type", /text/)
            .expect(200)
            .then(res => {
            t.assert(res.text.includes("Random numbers (generated)"), "html contains title");
            t.assert(res.text.includes("<li>"), "html contains at least one <li> tag");
        });
    })
        .catch(err => {
        client.end()
            .then(() => t.end(err));
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
test("transaction with mysql query to dashboard", { timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS }, t => {
    // Build scout config & app meta for test
    const config = types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        name: TestConstants.TEST_SCOUT_NAME,
    });
    if (!config.key) {
        throw new Error("No Scout key! Provide one with the SCOUT_KEY ENV variable");
    }
    if (!config.name) {
        throw new Error("No Scout name! Provide one with the SCOUT_NAME ENV variable");
    }
    const appMeta = new types_1.ApplicationMetadata(config, { frameworkVersion: "test" });
    // Build scout instance, get ready to hold an active mysql connection
    const scout = new scout_1.Scout(config, { appMeta });
    SCOUT_INSTANCES.push(scout);
    let conn;
    // Set up a listener to wait for scout to report the transaction
    const listener = (message) => {
        // Ignore requests that are sent that aren't span starts
        if (!message || message.type !== types_1.AgentRequestType.V1FinishRequest) {
            return;
        }
        t.pass("witnessed V1FinishRequest being sent");
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Fire off disconnect
        conn.end(() => t.end());
    };
    // Set up listener on the agent to listen for the stop request to be sent
    scout.on(types_1.AgentEvent.RequestSent, listener);
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
                conn.query(fixtures_1.SQL_QUERIES.SELECT_TIME, (err, result) => {
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
test("transaction with mysql2 query to dashboard", { timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS }, t => {
    // Build scout config & app meta for test
    const config = types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        name: TestConstants.TEST_SCOUT_NAME,
    });
    if (!config.key) {
        throw new Error("No Scout key! Provide one with the SCOUT_KEY ENV variable");
    }
    if (!config.name) {
        throw new Error("No Scout name! Provide one with the SCOUT_NAME ENV variable");
    }
    const appMeta = new types_1.ApplicationMetadata(config, { frameworkVersion: "test" });
    // Build scout instance, get ready to hold an active mysql connection
    const scout = new scout_1.Scout(config, { appMeta });
    SCOUT_INSTANCES.push(scout);
    let conn;
    // Set up a listener to wait for scout to report the transaction
    const listener = (message) => {
        // Ignore requests that are sent that aren't span starts
        if (!message || message.type !== types_1.AgentRequestType.V1FinishRequest) {
            return;
        }
        t.pass("witnessed V1FinishRequest being sent");
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Fire off disconnect
        conn.end(() => t.end());
    };
    // Set up listener on the agent to listen for the stop request to be sent
    scout.on(types_1.AgentEvent.RequestSent, listener);
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
                conn.query(fixtures_1.SQL_QUERIES.SELECT_TIME, (err, result) => {
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
test("Express pug integration dashboard send", { timeout: TestUtil.DASHBOARD_SEND_TIMEOUT_MS }, t => {
    // Build scout config & app meta for test
    const config = types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        name: TestConstants.TEST_SCOUT_NAME,
    });
    if (!config.key) {
        throw new Error("No Scout key! Provide one with the SCOUT_KEY ENV variable");
    }
    if (!config.name) {
        throw new Error("No Scout name! Provide one with the SCOUT_NAME ENV variable");
    }
    const scout = new scout_1.Scout(config);
    SCOUT_INSTANCES.push(scout);
    // Create an application that's set up to use pug templating
    const app = TestUtil.simpleHTML5BoilerplateApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
    }), "pug");
    // Set up a listener that should fire when the request is finished
    const listener = (data, another) => {
        // Remove listener since this should fire once
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
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
        const renderSpan = innerSpans.find(s => s.operation === types_1.ScoutSpanOperation.TemplateRender);
        t.assert(renderSpan, "template render span was present on request");
        if (!renderSpan) {
            t.fail("no render span present on request");
            throw new Error("No render span");
        }
        t.assert(renderSpan.getContextValue(types_1.ScoutContextName.Name), "template name context is present");
        t.end();
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    return request(app)
        .get("/")
        .expect("Content-Type", /html/)
        .expect(200)
        .then(res => {
        t.assert(res.text.includes("<title>dynamic</title>"), "dynamic template was rendered by express");
    });
});
// Shutdown all the scout instances after waiting what we expect should be enough time to send the tests
test("wait for all scout instances to send", t => {
    // Wait ~2 minutes for request to be sent to scout in the cloud then shutdown
    TestUtil.waitMinutes(2)
        .then(() => t.comment(`shutting down [${SCOUT_INSTANCES.length}] scout instances...`))
        .then(() => Promise.all(SCOUT_INSTANCES.map(s => s.shutdown())))
        .then(() => {
        t.pass("all scout instances were shut down");
        t.end();
    })
        .catch(t.end);
});
