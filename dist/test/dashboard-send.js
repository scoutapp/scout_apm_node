"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const lib_1 = require("../lib");
const TestUtil = require("./util");
const TestConstants = require("./constants");
// This "test" is made to send to the dashboard
// it does not shut down scout in order to give it time to actually send data
// https://github.com/scoutapp/scout_apm_node/issues/71
test("Scout sends basic controller span to dashboard", t => {
    const config = lib_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        name: TestConstants.TEST_SCOUT_NAME,
    });
    const appMeta = new lib_1.ApplicationMetadata(config, { frameworkVersion: "test" });
    if (!config.key) {
        throw new Error("No Scout key! Provide one with the SCOUT_KEY ENV variable");
    }
    if (!config.name) {
        throw new Error("No Scout name! Provide one with the SCOUT_NAME ENV variable");
    }
    const scout = new lib_1.Scout(config, { appMeta });
    let req;
    let span;
    scout
        .setup()
        .then(() => scout.startRequest())
        .then(r => req = r)
        .then(() => req.startChildSpan(`Controller/GET /`))
        .then(s => span = s)
        // Simulate a ~200 ms request
        .then(() => TestUtil.waitMs(200))
        .then(() => span.stop())
        .then(() => req.finishAndSend())
        .then(() => t.ok("request finished and sent successfully (check the dashboard)"))
        // Wait 2 mins for scout to send data
        .then(() => TestUtil.waitMinutes(2))
        // Teardown and end test
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
