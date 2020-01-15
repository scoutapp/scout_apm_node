"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const integrations_1 = require("../../lib/types/integrations");
// The hook for MYSQL has to be triggered this way in a typescript context
// since a partial improt like { Client } will not trigger a require
const mysql = require("mysql");
// NOTE: this test *presumes* that the integration is working, since the integration is require-based
// it may break if import order is changed (require hook would not have taken place)
test("the shim works", t => {
    const connection = mysql.createConnection({ host: "localhost", user: "mysql", password: "mysql" });
    t.assert([integrations_1.scoutIntegrationSymbol], "client has the integration symbol");
    t.end();
});
