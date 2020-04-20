import { setupRequireIntegrations } from "../../lib";
// The hook for PG has to be triggered this way in a typescript context
// since a partial import like { Client } will not trigger a require
setupRequireIntegrations(["pg"]);

import { Client } from "pg";
import { Sequelize, QueryTypes } from "sequelize";

import * as test from "tape";
import * as TestUtil from "../util";
import * as Constants from "../../lib/constants";

import { getIntegrationSymbol } from "../../lib/types/integrations";
import { ScoutEvent, buildScoutConfiguration } from "../../lib/types";

import {
    Scout,
    ScoutRequest,
    ScoutSpan,
    ScoutEventRequestSentData,
} from "../../lib/scout";

import { ScoutContextName, ScoutSpanOperation } from "../../lib/types";

import { SQL_QUERIES } from "../fixtures";


let PG_CONTAINER_AND_OPTS: TestUtil.ContainerAndOpts | null = null;

// NOTE: this test *presumes* that the integration is working, since the integration is require-based
// it may break if import order is changed (require hook would not have taken place)
test("the shim works", t => {
    t.assert(Client[getIntegrationSymbol()], "client has the integration symbol");
    t.end();
});

// Pseudo test that will start a containerized postgres instance
TestUtil.startContainerizedPostgresTest(test, cao => {
    PG_CONTAINER_AND_OPTS = cao;
});

test("SELECT query during a request is recorded", {timeout: TestUtil.PG_TEST_TIMEOUT_MS}, t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    // Setup a PG Client that we'll use later
    let client: Client;

    // Set up a listener for the scout request that will contain the DB record
    const listener = (data: ScoutEventRequestSentData) => {
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Look up the database span from the request
        data.request
            .getChildSpans()
            .then(spans => {
                const dbSpan = spans.find(s => s.operation === ScoutSpanOperation.SQLQuery);
                t.assert(dbSpan, "db span was present on request");
                if (!dbSpan) {
                    t.fail("no DB span present on request");
                    throw new Error("No DB Span");
                }

                t.equals(
                    dbSpan.getContextValue(ScoutContextName.DBStatement),
                    SQL_QUERIES.SELECT_TIME,
                    "db.statement tag is correct",
                );
            })
            .then(() => client.end())
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => {
                client.end()
                    .then(() => TestUtil.shutdownScout(t, scout, err));
            });
    };

    // Activate the listener
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Connect to the postgres
        .then(() => TestUtil.makeConnectedPGClient(() => PG_CONTAINER_AND_OPTS))
        .then(c => client = c)
    // Start a scout transaction & perform a query
        .then(() => scout.transaction("Controller/select-now-test", done => {
            return client
                .query(SQL_QUERIES.SELECT_TIME)
                .then(() => {
                    t.comment("performed query");
                    done();
                });
        }))
    // Finish & Send the request
        .catch(err => {
            client.end()
                .then(() => TestUtil.shutdownScout(t, scout, err));
        });
});

test("CREATE TABLE and INSERT are recorded", {timeout: TestUtil.PG_TEST_TIMEOUT_MS}, t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    // Set up a listener for the scout request that will contain the DB record
    const listener = (data: ScoutEventRequestSentData) => {
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Look up the database span from the request
        data.request
            .getChildSpans()
            .then(spans => {
                const dbSpans = spans.filter(s => s.operation === "SQL/Query");
                t.equal(dbSpans.length, 2, "two db spans were present");

                // Ensure span for CREATE TABLE is present
                const createTableSpan = dbSpans.find(s => {
                    return s.getContextValue(ScoutContextName.DBStatement) === SQL_QUERIES.CREATE_STRING_KV_TABLE;
                });
                if (!createTableSpan) {
                    t.fail("span for CREATE TABLE not found");
                    throw new Error("span for create table not found");
                }

                // Ensure span for INSERT is present
                const insertSpan = dbSpans.find(s => {
                    return s.getContextValue(ScoutContextName.DBStatement) === SQL_QUERIES.INSERT_STRING_KV_TABLE;
                });
                if (!insertSpan) {
                    t.fail("span for INSERT not found");
                    throw new Error("span for insert not found");
                }
            })
        // Reset the database by removing the kv table
            .then(() => {
                t.comment("removing kv table for next test...");
                return client.query(SQL_QUERIES.DROP_STRING_KV_TABLE);
            })
        // If everything went well, close the client and shutdown scout
            .then(() => client.end())
            .then(() => TestUtil.shutdownScout(t, scout))
        // If an error occurred, close & shutdown anyway
            .catch(err => {
                client.end()
                    .then(() => TestUtil.shutdownScout(t, scout, err));
            });
    };

    // Activate the listener
    scout.on(ScoutEvent.RequestSent, listener);

    let client: Client;

    scout
        .setup()
    // Connect to the postgres
        .then(() => TestUtil.makeConnectedPGClient(() => PG_CONTAINER_AND_OPTS))
        .then(c => client = c)
    // Start a scout transaction & perform a query
        .then(() => scout.transaction("Controller/create-and-insert-test", done => {
            // Create a string KV table
            return client
                .query(SQL_QUERIES.CREATE_STRING_KV_TABLE)
            // Insert a value into the string KV
                .then(() => client.query(SQL_QUERIES.INSERT_STRING_KV_TABLE, ["testKey", "testValue"]))
            // Check the results
                .then(results => {
                    t.equals(results.rowCount, 1, "one row was inserted");
                    done();
                });
        }))
    // Finish & Send the request
        .catch(err => {
            (client ? client.end() : Promise.resolve())
                .then(() => TestUtil.shutdownScout(t, scout, err));
        });
});

// https://github.com/scoutapp/scout_apm_node/issues/191
test("sequelize basic authenticate works", {timeout: TestUtil.PG_TEST_TIMEOUT_MS}, t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    // Set up a listener for the scout request that will contain the DB record
    const listener = (data: ScoutEventRequestSentData) => {
        // Ensure that we have the span we expect as top level
        const spans = data.request.getChildSpansSync();
        const mainSpan = spans.find(s => s.operation === "Controller/create-and-insert-test");

        // If we haven't found a request w/ our top level span then exit (and continue listening)
        if (!mainSpan) { return; }
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Look up the database span from the request
        mainSpan
            .getChildSpans()
            .then(spans => {
                const dbSpans = spans.filter(s => s.operation === "SQL/Query");
                t.assert(dbSpans.length > 1, "at least one db span was present (sequelize makes many)");

                // Sequelize happens to do 'SELECT 1+1 AS result' as a test, find that span
                const selectSpan = dbSpans.find(s => {
                    let v = s.getContextValue(ScoutContextName.DBStatement);
                    return v && typeof v === "string" && v.includes("SELECT 1+1");
                });
                if (!selectSpan) {
                    t.fail("span for SELECT not found");
                    throw new Error("span for SELECT not found");
                }
                t.assert(selectSpan, "span for SELECT was found");
            })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Activate the listener
    scout.on(ScoutEvent.RequestSent, listener);

    let client: Client;
    let connString: string;

    scout
        .setup()
    // Create the connection string for sequelize to use
        .then(() => TestUtil.makePGConnectionString(() => PG_CONTAINER_AND_OPTS))
        .then(s => connString = s)
    // Start an instrumentation (which auto creates a request)
        .then(() => scout.instrument("Controller/create-and-insert-test", done => {
            // Create sequelize client (this could fail if PG_CONTAINER_AND_OPTS is invalid
            const sequelize = new Sequelize(connString);

            // Test connection
            return sequelize.authenticate()
                .then(() => t.pass("sequelize authenticate call succeeded"))
                .then(() => done());
        }))
    // Finish & Send the request
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/191
test("sequelize library works", {timeout: TestUtil.PG_TEST_TIMEOUT_MS}, t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    // Set up a listener for the scout request that will contain the DB record
    const listener = (data: ScoutEventRequestSentData) => {
        // Ensure that we have the span we expect as top level
        const spans = data.request.getChildSpansSync();
        const mainSpan = spans.find(s => s.operation === "Controller/create-and-insert-test");

        // If we haven't found a request w/ our top level span then exit (and continue listening)
        if (!mainSpan) { return; }
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Look up the database span from the request
        mainSpan
            .getChildSpans()
            .then(spans => {
                const dbSpans = spans.filter(s => s.operation === "SQL/Query");
                t.assert(dbSpans.length > 1, "at least one db span was present (sequelize makes many)");

                // Ensure span for CREATE TABLE is present
                // NOTE: we can't use the exact query as we sent it here because
                // it gets changed a little while being processed by sequelize
                const createTableSpan = dbSpans.find(s => {
                     let v = s.getContextValue(ScoutContextName.DBStatement);
                     return v && typeof v === "string" && v.includes("CREATE TABLE kv");
                });
                if (!createTableSpan) {
                    t.fail("span for CREATE TABLE not found");
                    throw new Error("span for create table not found");
                }

                // Ensure span for INSERT is present
                const insertSpan = dbSpans.find(s => {
                     let v = s.getContextValue(ScoutContextName.DBStatement);
                     return v && typeof v === "string" && v.includes(SQL_QUERIES.INSERT_STRING_KV_TABLE);
                });
                if (!insertSpan) {
                    t.fail("span for INSERT not found");
                    throw new Error("span for insert not found");
                }
            })
        // Reset the database by removing the kv table
            .then(() => {
                t.comment("removing kv table for next test...");
                return sequelize.query(SQL_QUERIES.DROP_STRING_KV_TABLE);
            })
        // Finish test
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Activate the listener
    scout.on(ScoutEvent.RequestSent, listener);

    let connString: string;
    let sequelize: Sequelize;

    scout
        .setup()
    // Create the connection string for sequelize to use
        .then(() => TestUtil.makePGConnectionString(() => PG_CONTAINER_AND_OPTS))
        .then(s => connString = s)
    // Start an instrumentation (which auto creates a request)
        .then(() => scout.instrument("Controller/create-and-insert-test", done => {
        // Create sequelize client (this could fail if PG_CONTAINER_AND_OPTS is invalid
            sequelize = new Sequelize(connString);

            // Create a string KV table (using a sequelize raw query)
            return sequelize
                .query(SQL_QUERIES.CREATE_STRING_KV_TABLE)
            // Insert a value into the string KV
                .then(() => sequelize.query(
                    SQL_QUERIES.INSERT_STRING_KV_TABLE,
                    {
                        type: QueryTypes.INSERT,
                        bind: ["testKey", "testValue"],
                    },
                ))
                .then(([rows, rowCount]) => {
                    t.equals(rowCount, 1, "one row was inserted");
                    done();
                });
        }))
    // Finish & Send the request
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// Pseudo test that will stop a containerized postgres instance that was started
TestUtil.stopContainerizedPostgresTest(test, () => PG_CONTAINER_AND_OPTS);
