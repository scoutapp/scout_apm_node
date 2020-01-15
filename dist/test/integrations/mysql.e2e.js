"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const TestUtil = require("../util");
const integrations_1 = require("../../lib/types/integrations");
// The hook for MYSQL has to be triggered this way in a typescript context
// since a partial improt like { Client } will not trigger a require
const mysql = require("mysql");
let MYSQL_CONTAINER_AND_OPTS = null;
// NOTE: this test *presumes* that the integration is working, since the integration is require-based
// it may break if import order is changed (require hook would not have taken place)
test("the shim works", t => {
    const connection = mysql.createConnection({ host: "localhost", user: "mysql", password: "mysql" });
    t.assert([integrations_1.scoutIntegrationSymbol], "client has the integration symbol");
    t.end();
});
// Pseudo test that will start a containerized postgres instance
TestUtil.startContainerizedMySQLTest(test, cao => {
    MYSQL_CONTAINER_AND_OPTS = cao;
});
// Pseudo test that will stop a containerized postgres instance that was started
TestUtil.stopContainerizedMySQLTest(test, () => MYSQL_CONTAINER_AND_OPTS);
