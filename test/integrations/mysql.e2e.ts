import * as test from "tape";
import * as TestUtil from "../util";
import * as Constants from "../../lib/constants";

import { scoutIntegrationSymbol } from "../../lib/types/integrations";
import {
    Scout,
    ScoutEvent,
    ScoutEventRequestSentData,
    ScoutRequest,
    buildScoutConfiguration,
    setupRequireIntegrations,
} from "../../lib";

import { SQL_QUERIES } from "../fixtures";

// The hook for MYSQL has to be triggered this way in a typescript context
// since a partial improt like { Client } will not trigger a require
const mysql = require("mysql");

let MYSQL_CONTAINER_AND_OPTS: TestUtil.ContainerAndOpts | null = null;

// NOTE: this test *presumes* that the integration is working, since the integration is require-based
// it may break if import order is changed (require hook would not have taken place)
test("the shim works", t => {
    const connection = mysql.createConnection({host: "localhost", user: "mysql", password: "mysql"});
    t.assert([scoutIntegrationSymbol], "client has the integration symbol");
    t.end();
});

// Pseudo test that will start a containerized postgres instance
TestUtil.startContainerizedMySQLTest(test, cao => {
    MYSQL_CONTAINER_AND_OPTS = cao;
});

// Pseudo test that will stop a containerized postgres instance that was started
TestUtil.stopContainerizedMySQLTest(test, () => MYSQL_CONTAINER_AND_OPTS);
