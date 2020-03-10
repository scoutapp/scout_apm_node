import { hostname } from "os";
import * as os from "os";
import * as path from "path";
import * as test from "tape";
import { Test } from "tape";
import { version as processVersion } from "process";
import { get as getRootDir } from "app-root-dir";

import {
    ScoutConfiguration,
    buildScoutConfiguration,
    ApplicationMetadata,
    LogLevel,
    CoreAgentVersion,
    generateTriple,
} from "../lib/types";

import { Scout } from "../lib/scout";

import { testConfigurationOverlay } from "./util";

test("ScoutConfiguration builds with minimal passed ENV", t => {
    // This env mimics what would be passed in from process.env
    const config = buildScoutConfiguration({}, {
        env: {
            SCOUT_NAME: "app",
            SCOUT_HOSTNAME: "hostname",
            SCOUT_KEY: "key",
        },
    });

    t.assert(config, "config was generated");
    t.equals(config.hostname, "hostname", "hostname was set");
    t.equals(config.name, "app", "application name was set");
    t.equals(config.key, "key", "key was set");

    t.end();
});

// // WARNING: This test must be run with some isolation or serially,
// // since it touches process.env (even though it resets it)
test("ScoutConfiguration overrides correctly for every config value", (t: Test) => {
    testConfigurationOverlay(t, {appKey: "name", envValue: "test", expectedValue: "test"});
    testConfigurationOverlay(t, {appKey: "appServer", envValue: "test-server", expectedValue: "test-server"});
    testConfigurationOverlay(t, {
      appKey: "applicationRoot",
      envValue: "/var/app/root",
      expectedValue: "/var/app/root"},
    );
    testConfigurationOverlay(t, {appKey: "coreAgentDir", envValue: "/tmp/dir", expectedValue: "/tmp/dir"});
    testConfigurationOverlay(t, {appKey: "coreAgentDownload", envValue: "true", expectedValue: true});
    testConfigurationOverlay(t, {appKey: "coreAgentLaunch", envValue: "false", expectedValue: false});
    testConfigurationOverlay(t, {appKey: "coreAgentLogLevel", envValue: "info", expectedValue: LogLevel.Info});
    testConfigurationOverlay(t, {appKey: "coreAgentPermissions", envValue: "700", expectedValue: 700});
    testConfigurationOverlay(t, {appKey: "coreAgentversion", envValue: "v1.2.4", expectedValue: "v1.2.4"});
    testConfigurationOverlay(t, {
        appKey: "disabledInstruments",
        envValue: "instrument_1,instrument_2",
        expectedValue: ["instrument_1", "instrument_2"],
    });
    testConfigurationOverlay(t, {appKey: "downloadUrl", envValue: "example.org", expectedValue: "example.org"});
    testConfigurationOverlay(t, {appKey: "framework", envValue: "fw_value", expectedValue: "fw_value"});
    testConfigurationOverlay(t, {appKey: "frameworkversion", envValue: "v1", expectedValue: "v1"});
    testConfigurationOverlay(t, {appKey: "hostname", envValue: "test-hostname", expectedValue: "test-hostname"});
    testConfigurationOverlay(t, {
        appKey: "ignore",
        envValue: "/api/v1/example,/api/v1/test",
        expectedValue: ["/api/v1/example", "/api/v1/test"],
    });
    testConfigurationOverlay(t, {appKey: "key", envValue: "123456789", expectedValue: "123456789"});
    testConfigurationOverlay(t, {appKey: "logLevel", envValue: "warn", expectedValue: LogLevel.Warn});
    testConfigurationOverlay(t, {appKey: "monitor", envValue: "true", expectedValue: true});
    testConfigurationOverlay(t, {appKey: "revisionSha", envValue: "51ab8123", expectedValue: "51ab8123"});
    testConfigurationOverlay(t, {appKey: "scmSubdirectory", envValue: "/var/code", expectedValue: "/var/code"});
    testConfigurationOverlay(t, {
        appKey: "socketPath",
        envValue: "/var/path/to/socket.sock",
        expectedValue: "/var/path/to/socket.sock",
    });

    t.end();
});

// https://github.com/scoutapp/scout_apm_node/issues/61
test("application metadata is correctly generated", (t: Test) => {
    const env = {
        SCOUT_NAME: "app",
        SCOUT_HOSTNAME: "hostname",
        SCOUT_KEY: "key",
        SCOUT_FRAMEWORK: "express",
        SCOUT_FRAMEWORK_VERSION: "v1",
        SCOUT_APP_SERVER: "appsrv",
        SCOUT_SCM_SUBDIRECTORY: "server",
        SCOUT_APPLICATION_ROOT: "/var/app",
        SCOUT_REVISION_SHA: "12345678",
    };

    const config = buildScoutConfiguration({}, {env});
    const appMetadata = new ApplicationMetadata(config);

    t.assert(appMetadata, "app metadata was generated");
    t.equals(appMetadata.language, "nodejs", `[language] matches [${appMetadata.language}]`);
    t.equals(appMetadata.languageVersion, processVersion, `[languageVersion] matches [${appMetadata.languageVersion}]`);
    t.assert(new Date(appMetadata.serverTime), `[serverTime] is a non null date [${appMetadata.serverTime}]`);
    t.equals(appMetadata.framework, env.SCOUT_FRAMEWORK, `[framework] matches [${appMetadata.framework}]`);
    t.equals(
        appMetadata.frameworkVersion,
        env.SCOUT_FRAMEWORK_VERSION,
        `[frameworkVersion] matches [${appMetadata.frameworkVersion}]`,
    );
    t.equals(appMetadata.environment, "", `[environment] matches [${appMetadata.environment}]`);
    t.equals(appMetadata.appServer, env.SCOUT_APP_SERVER, `[appServer] matches [${appMetadata.appServer}]`);
    t.equals(appMetadata.hostname, env.SCOUT_HOSTNAME, `[hostname] matches [${appMetadata.hostname}]`);
    t.equals(appMetadata.databaseEngine, "", `[databaseEngine] matches [${appMetadata.databaseEngine}]`);
    t.equals(appMetadata.databaseAdapter, "", `[databaseAdapter] matches [${appMetadata.databaseAdapter}]`);
    t.equals(appMetadata.applicationName, env.SCOUT_NAME, `[applicationName] matches [${appMetadata.applicationName}]`);
    t.assert(
        appMetadata.libraries && appMetadata.libraries instanceof Array,
        `[libraries] is non-null and an array [${appMetadata.libraries}]`,
    );
    t.equals(appMetadata.paas, "", `[paas] matches [${appMetadata.paas}]`);
    t.equals(
        appMetadata.applicationRoot,
        env.SCOUT_APPLICATION_ROOT,
        `[applicationRoot] matches [${appMetadata.applicationRoot}]`,
    );
    t.equals(
        appMetadata.scmSubdirectory,
        env.SCOUT_SCM_SUBDIRECTORY,
        `[scmSubdirectory] matches [${appMetadata.scmSubdirectory}]`,
    );
    t.equals(appMetadata.gitSHA, env.SCOUT_REVISION_SHA, `[gitSHA] matches [${appMetadata.gitSHA}]`);

    t.end();
});

// https://github.com/scoutapp/scout_apm_node/issues/124
test("core agent dir matches python", (t: Test) => {
    const config = buildScoutConfiguration({coreAgentVersion: "v1.2.7"});
    const scout = new Scout(config);

    const expectedCoreAgentDir = path.join(
        os.tmpdir(),
        "scout_apm_core",
    );

    const expectedSocketPath = path.join(
        expectedCoreAgentDir,
        `scout_apm_core-v1.2.7-${generateTriple()}`,
        "core-agent.sock",
    );

    t.equals(config.coreAgentDir, expectedCoreAgentDir, "core agent directory matches the expected value");
    t.equals(scout.getSocketPath(), `unix://${expectedSocketPath}`, "socket path matches expected value");

    t.end();
});

// https://github.com/scoutapp/scout_apm_node/issues/169
test("application root is present in default", (t: Test) => {
    const config = buildScoutConfiguration({coreAgentVersion: "v1.2.7"});

    const expectedRootDir = getRootDir();

    t.equals(config.applicationRoot, expectedRootDir, `root dir matches expected [${expectedRootDir}]`);

    t.end();
});
