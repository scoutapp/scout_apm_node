import * as test from "tape";

import {
    LogLevel,
    AgentLaunchDisabled,
    ApplicationMetadata,
    ExternalDownloadDisallowed,
    Scout,
    ScoutRequest,
    ScoutSpan,
    consoleLogFn,
} from "../lib";

import {
    AgentEvent,
    AgentRequestType,
    BaseAgentRequest,
    ScoutEvent,
    buildScoutConfiguration,
} from "../lib/types";

import { V1FinishRequest } from "../lib/protocol/v1/requests";

import * as TestUtil from "./util";
import * as TestConstants from "./constants";

// This "test" is made to send to the dashboard
// it does not shut down scout in order to give it time to actually send data
// https://github.com/scoutapp/scout_apm_node/issues/71
test("Scout sends basic controller span to dashboard", {timeout: TestUtil.DASHBOARD_SEND_TIMEOUT}, t => {
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

    const scout = new Scout(config, {appMeta, logFn: consoleLogFn});

    // Set up a listener to wait for scout to report the transaction
    const listener = (message: BaseAgentRequest) => {
        // Ignore requests that are sent that aren't span starts
        if (!message || message.type !== AgentRequestType.V1FinishRequest) { return; }

        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Wait ~2 minutes for request to be sent to scout in the cloud then shutdown
        TestUtil.waitMinutes(2)
            .then(() => TestUtil.shutdownScout(t, scout));
    };

    // Set up listener on the agent to listen for the stop request to be sent
    scout.on(AgentEvent.RequestSent, listener);

    const name = `Controller/GET /`;

    scout.transaction(name, () => {
        return scout.instrument(name, () => {
            return TestUtil.waitMs(200)
                .then(() => t.pass("wait completed"))
                .catch(err => t.fail("some error occurred"));
        });
    })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
