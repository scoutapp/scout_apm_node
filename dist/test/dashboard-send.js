"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const lib_1 = require("../lib");
const types_1 = require("../lib/types");
const TestUtil = require("./util");
const TestConstants = require("./constants");
// This "test" is made to send to the dashboard
// it does not shut down scout in order to give it time to actually send data
// https://github.com/scoutapp/scout_apm_node/issues/71
test("Scout sends basic controller span to dashboard", { timeout: TestUtil.DASHBOARD_SEND_TIMEOUT }, t => {
    const config = types_1.buildScoutConfiguration({
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
    // Set up a listener to wait for scout to report the transaction
    const listener = (message) => {
        // Ignore requests that are sent that aren't span starts
        if (!message || message.type !== types_1.AgentRequestType.V1FinishRequest) {
            return;
        }
        t.pass("Witnessed V1FinishRequest being sent");
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Wait ~2 minutes for request to be sent to scout in the cloud then shutdown
        TestUtil.waitMinutes(2)
            .then(() => TestUtil.shutdownScout(t, scout));
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
    })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
