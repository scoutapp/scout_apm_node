import * as path from "path";
import * as tmp from "tmp-promise";
import * as express from "express";
import { Application, Request, Response } from "express";

import * as Constants from "../lib/constants";
import ExternalProcessAgent from "../lib/agents/external-process";
import WebAgentDownloader from "../lib/agent-downloaders/web";
import {
    APIVersion,
    Agent,
    AgentDownloadOptions,
    CoreAgentVersion,
    ProcessOptions,
    ScoutConfiguration,
    buildScoutConfiguration,
    convertCamelCaseToEnvVar,
} from "../lib/types";
import { DEFAULT_SCOUT_CONFIGURATION } from "../lib/types/config";
import { Scout } from "../lib";
import { V1Register } from "../lib/protocol/v1/requests";
import { Test } from "tape";

// Helper for downloading and creating an agent
export function bootstrapExternalProcessAgent(
    t: Test,
    rawVersion: string,
    opts?: {
        buildProcOpts?: (bp: string, uri: string) => ProcessOptions,
    },
): Promise<ExternalProcessAgent> {
    const downloadOpts: AgentDownloadOptions = {
        cacheDir: Constants.DEFAULT_CORE_AGENT_DOWNLOAD_CACHE_DIR,
        updateCache: true,
    };
    const downloader = new WebAgentDownloader();
    const version = new CoreAgentVersion(rawVersion);

    let uri: string;
    let binPath: string;

    // Download binary
    return downloader
        .download(version, downloadOpts)
        .then(bp => binPath = bp)
    // Create temporary directory for socket
        .then(() => tmp.dir({prefix: "core-agent-test-"}))
        .then(result => {
            const socketPath = path.join(result.path, "core-agent.sock");
            uri = `unix://${socketPath}`;
        })
    // Start process
        .then(() => {
            let procOpts = new ProcessOptions(binPath, uri);
            if (opts && opts.buildProcOpts) {
                procOpts = opts.buildProcOpts(binPath, uri);
            }

            t.comment(`creating external process agent @ [${uri}]...`);
            return new ExternalProcessAgent(procOpts);
        });
}

// Helper for initializing a bootstrapped agent
export function initializeAgent(
    t: Test,
    agent: Agent,
    appName: string,
    agentKey: string,
    appVersion: CoreAgentVersion,
    apiVersion: APIVersion = APIVersion.V1,
): Promise<Agent> {
    t.comment(`initializing agent with appName [${appName}]`);
    return agent.start()
        .then(() => agent.connect())
        .then(() => agent.send(new V1Register(appName, agentKey, apiVersion)))
        .then(() => agent);
}

export function waitMs(ms: number, t?: Test): Promise<void> {
    return new Promise(resolve => {
        setTimeout(() => {
            if (t) { t.comment(`...waited ${ms}ms`); }
            resolve();
        }, ms);
    });
}

// Helper function for cleaning up an agent processe and passing/failing a test
export function cleanup(t: Test, agent: ExternalProcessAgent, err?: Error): Promise<void> {
    return agent.getProcess()
        .then(process => process.kill())
        .then(() => t.end(err));
}

// Helper that waits for agent buffer to flush
export function waitForAgentBufferFlush(t?: Test): Promise<void> {
    const interval = Constants.AGENT_BUFFER_TIME_MS;
    if (t) {
        t.comment(`Waiting for agent buffer time (${interval / Constants.MINUTE_MS} minutes)...`);
    }
    return waitMs(interval);
}

// Helper function to clean up an official (user-facing) scout instance
export function shutdownScout(t: Test, scout: Scout, err?: Error): Promise<void> {
    return scout.shutdown()
        .then(() => t.end(err));
}

// Make a simple express application that just returns
// some JSON ({status: "success"}) after waiting a certain amount of milliseconds if provided
export function simpleExpressApp(middleware: any, delayMs: number = 0): Application {
    const app = express();

    if (middleware) {
        app.use(middleware);
    }

    app.get("/", (req: Request, res: Response) => {
        waitMs(delayMs)
            .then(() => res.send({status: "success"}));
    });

    return app;
}

// Make an express app with a route with a dynamic segment which returns
// some JSON ({status: "success", segment: <what you sent>}) after waiting a certain amount of milliseconds if provided
export function simpleDynamicSegmentExpressApp(middleware: any, delayMs: number = 0): Application {
    const app = express();

    if (middleware) {
        app.use(middleware);
    }

    app.get("/", (req: Request, res: Response) => {
        waitMs(delayMs)
            .then(() => res.send({status: "success"}));
    });

    app.get("/dynamic/:segment", (req: Request, res: Response) => {
        waitMs(delayMs)
            .then(() => res.send({
                segment: req.params.segment,
                status: "success",
            }));
    });

    return app;
}

// Test that a given variable is effectively overlaid in the configuration
export function testConfigurationOverlay(
    t: Test,
    opts: {
        appKey: string,
        envValue: string,
        expectedValue: any,
    },
): void {
    const {appKey, envValue, expectedValue} = opts;
    const envKey = convertCamelCaseToEnvVar(appKey);

    const defaultConfig = buildScoutConfiguration();
    t.assert(defaultConfig, "defaultConfig was generated");
    if (appKey in DEFAULT_SCOUT_CONFIGURATION) {
        t.equals(defaultConfig[appKey], DEFAULT_SCOUT_CONFIGURATION[appKey], `config [${appKey}] matches default`);
    }

    // Set key at the application level
    const appConfig: Partial<ScoutConfiguration> = {};
    appConfig[appKey] = expectedValue;

    const appOnlyConfig = buildScoutConfiguration(appConfig);
    t.assert(appOnlyConfig, "appOnlyConfig was generated");
    t.equals(appOnlyConfig[appKey], expectedValue, `config [${appKey}] matches app value when set by app`);

    // Save the previous ENV value
    const wasPresent = envKey in process.env;
    const previousKeyValue = process.env[envKey];

    process.env[envKey] = envValue;

    // FUTURE: we could also *simulate* process.env here by passing in {env: {...}} to buildScoutConfiguration
    // since we're not trying to do parallel tests yet (env will be changed and reset serially), it's fine
    const envOverrideConfig = buildScoutConfiguration(appConfig);
    t.assert(envOverrideConfig, "envOverrideConfig was generated");
    t.deepEquals(envOverrideConfig[appKey], expectedValue, `config [${appKey}] matches app value when set by app`);

    // Reset the env value
    // Set key to the previous value if it was present
    if (wasPresent) {
        process.env[envKey] = previousKeyValue;
    } else {
        delete process.env[envKey];
    }
}
