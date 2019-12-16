import { hostname } from "os";
import * as test from "tape";
import { Test } from "tape";

import {
    ScoutConfiguration,
    buildScoutConfiguration,
    buildApplicationMetadata,
    LogLevel,
} from "../lib/types";
import { testConfigurationOverlay } from "./util";

// test("ScoutConfiguration builds with minimal passed ENV", t => {
//     // This env mimics what would be passed in from process.env
//     const config = buildScoutConfiguration({}, {
//         env: {
//             SCOUT_NAME: "app",
//             SCOUT_HOSTNAME: "hostname",
//             SCOUT_KEY: "key",
//         },
//     });

//     t.assert(config, "config was generated");
//     t.equals(config.hostname, "hostname", "hostname was set");
//     t.equals(config.name, "app", "application name was set");
//     t.equals(config.key, "key", "key was set");

//     t.end();
// });

// // // WARNING: This test must be run with some isolation or serially,
// // // since it touches process.env (even though it resets it)
// test("ScoutConfiguration overrides correctly for every config value", (t: Test) => {
//     testConfigurationOverlay(t, {appKey: "name", envValue: "test", expectedValue: "test"});
//     testConfigurationOverlay(t, {appKey: "appServer", envValue: "test-server", expectedValue: "test-server"});
//     testConfigurationOverlay(t, {
//       appKey: "applicationRoot",
//       envValue: "/var/app/root",
//       expectedValue: "/var/app/root"},
//     );
//     testConfigurationOverlay(t, {appKey: "coreAgentDir", envValue: "/tmp/dir", expectedValue: "/tmp/dir"});
//     testConfigurationOverlay(t, {appKey: "coreAgentDownload", envValue: "true", expectedValue: true});
//     testConfigurationOverlay(t, {appKey: "coreAgentLaunch", envValue: "false", expectedValue: false});
//     testConfigurationOverlay(t, {appKey: "coreAgentLogLevel", envValue: "info", expectedValue: LogLevel.Info});
//     testConfigurationOverlay(t, {appKey: "coreAgentPermissions", envValue: "700", expectedValue: 700});
//     testConfigurationOverlay(t, {appKey: "coreAgentversion", envValue: "v1.2.4", expectedValue: "v1.2.4"});
//     testConfigurationOverlay(t, {
//         appKey: "disabledInstruments",
//         envValue: "instrument_1,instrument_2",
//         expectedValue: ["instrument_1", "instrument_2"],
//     });
//     testConfigurationOverlay(t, {appKey: "downloadUrl", envValue: "example.org", expectedValue: "example.org"});
//     testConfigurationOverlay(t, {appKey: "framework", envValue: "fw_value", expectedValue: "fw_value"});
//     testConfigurationOverlay(t, {appKey: "frameworkversion", envValue: "v1", expectedValue: "v1"});
//     testConfigurationOverlay(t, {appKey: "hostname", envValue: "test-hostname", expectedValue: "test-hostname"});
//     testConfigurationOverlay(t, {
//         appKey: "ignore",
//         envValue: "/api/v1/example,/api/v1/test",
//         expectedValue: ["/api/v1/example", "/api/v1/test"],
//     });
//     testConfigurationOverlay(t, {appKey: "key", envValue: "123456789", expectedValue: "123456789"});
//     testConfigurationOverlay(t, {appKey: "logLevel", envValue: "warn", expectedValue: LogLevel.Warn});
//     testConfigurationOverlay(t, {appKey: "monitor", envValue: "true", expectedValue: true});
//     testConfigurationOverlay(t, {appKey: "revisionSha", envValue: "51ab8123", expectedValue: "51ab8123"});
//     testConfigurationOverlay(t, {appKey: "scmSubdirectory", envValue: "/var/code", expectedValue: "/var/code"});
//     testConfigurationOverlay(t, {
//         appKey: "socketPath",
//         envValue: "/var/path/to/socket.sock",
//         expectedValue: "/var/path/to/socket.sock",
//     });

//     t.end();
// });

// https://github.com/scoutapp/scout_apm_node/issues/61
test("application metadata is correctly generated", (t: Test) => {
    const config = buildScoutConfiguration({}, {
        env: {
            SCOUT_NAME: "app",
            SCOUT_HOSTNAME: "hostname",
            SCOUT_KEY: "key",
        },
    });

    const appMetadata = buildApplicationMetadata(config);

    t.assert(appMetadata, "app metadata was generated");
    // TODO: check more things
});
