"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const lib_1 = require("../lib");
// This needs to be set up *before* TestUtil runs so pg used there will be instrumented
lib_1.setupRequireIntegrations(["pg", "ejs"]);
const TestUtil = require("./util");
let PG_CONTAINER_AND_OPTS = null;
// Pseudo test that will start a containerized postgres instance
TestUtil.startContainerizedPostgresTest(test, cao => {
    PG_CONTAINER_AND_OPTS = cao;
});
// Pseudo test that will stop a containerized postgres instance that was started
TestUtil.stopContainerizedPostgresTest(test, () => PG_CONTAINER_AND_OPTS);
