import * as path from "path";
import * as tmp from "tmp-promise";
import * as express from "express";
import { Application, Request, Response } from "express";
import * as randomstring from "randomstring";
import { timeout, TimeoutError } from "promise-timeout";
import { ChildProcess, spawn } from "child_process";
import { EventEmitter } from "events";
import { Readable } from "stream";

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
import { ScoutOptions } from "../lib/scout";
import { DEFAULT_SCOUT_CONFIGURATION } from "../lib/types/config";
import { Scout } from "../lib";
import { V1Register } from "../lib/protocol/v1/requests";
import { Test } from "tape";

// Wait a little longer for requests that use express
export const EXPRESS_TEST_TIMEOUT = 2000;

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

export function waitMinutes(mins: number, t?: Test): Promise<void> {
    return waitMs(mins * 60 * 1000, t);
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

    app.post("/echo-by-post", (req: Request, res: Response) => {
        waitMs(delayMs)
            .then(() => res.send({
                data: req.body,
                status: "success",
            }));
    });

    return app;
}

// An express application which errors on the /
export function simpleErrorApp(middleware: any, delayMs: number = 0): Application {
    const app = express();
    app.use(middleware);

    app.get("/", (req: Request, res: Response) => {
        throw new Error("Expected application error (simpleErrorApp)");
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
    const envValueIsSet = envKey in process.env;

    const defaultConfig = buildScoutConfiguration();
    t.assert(defaultConfig, "defaultConfig was generated");

    // Only perform this check if we're not currently overriding the value in ENV *during* this test
    // it won't be the default, because we've set it to be so
    if (appKey in DEFAULT_SCOUT_CONFIGURATION && !envValueIsSet) {
        t.equals(defaultConfig[appKey], DEFAULT_SCOUT_CONFIGURATION[appKey], `config [${appKey}] matches default`);
    }

    // Set key at the application level
    const appConfig: Partial<ScoutConfiguration> = {};
    appConfig[appKey] = expectedValue;

    const appOnlyConfig = buildScoutConfiguration(appConfig);
    t.assert(appOnlyConfig, "appOnlyConfig was generated");

    // Only perform this check if we're not currently overriding the value in ENV *during* this test
    // ENV overrides the app so it won't be the app value
    if (!envValueIsSet) {
        t.equals(appOnlyConfig[appKey], expectedValue, `config [${appKey}] matches app value when set by app`);
    }

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

export function buildCoreAgentSocketResponse(json: string): Buffer {
    const buf = Buffer.concat([
        Buffer.allocUnsafe(4),
        Buffer.from(json),
    ]);
    buf.writeUInt32BE(json.length, 0);

    return buf;
}

export function buildTestScoutInstance(
    configOverride?: Partial<ScoutConfiguration>,
    options?: Partial<ScoutOptions>,
): Scout {
    const cfg = buildScoutConfiguration(
        Object.assign({allowShutdown: true, monitor: true}, configOverride),
    );
    return new Scout(cfg, options);
}

export class TestContainerStartOpts {
    public readonly dockerBinPath: string = "/bin/docker";
    // Phrases that should be waited for before the container is "started"
    public readonly waitFor: {stdout?: string, stderr?: string} = {};
    public readonly startTimeoutMs: number = 5000;
    public readonly stopTimeoutMs: number = 5000;

    public imageName: string;
    public tagName: string = "latest";
    public containerName: string;
    public env: object = process.env;

    constructor(opts: Partial<TestContainerStartOpts>) {
        if (opts) {
            if (opts.dockerBinPath) { this.dockerBinPath = opts.dockerBinPath; }
            if (opts.waitFor) { this.waitFor = opts.waitFor; }
            if (opts.imageName) { this.imageName = opts.imageName; }
            if (opts.tagName) { this.tagName = opts.tagName; }
            if (opts.containerName) { this.containerName = opts.containerName; }
            if (opts.startTimeoutMs) { this.startTimeoutMs = opts.startTimeoutMs; }
            if (opts.stopTimeoutMs) { this.stopTimeoutMs = opts.stopTimeoutMs; }
            if (opts.env) { this.env = opts.env; }
        }

        // Generate a random container name if one wasn't provided
        if (!this.containerName) {
            this.containerName = `test-${this.imageName}-${randomstring()}`;
        }
    }

    public imageWithTag(): string {
        return `${this.imageName}:${this.tagName}`;
    }
}

export interface ContainerAndOpts {
    containerProcess: ChildProcess;
    opts: TestContainerStartOpts;
}

/**
 * Start a container in a child process for use with tests
 *
 * @param {Test} t - the test (tape) instance
 * @param {string} image - the image name (ex. "postgres")
 * @param {string} tag - the image tag (ex. "12")
 * @returns {Promise<ChildProcess>} A promise that resolves to the spawned child process
 */
export function startContainer(
    t: Test,
    optOverrides: Partial<TestContainerStartOpts>,
): Promise<ContainerAndOpts> {
    const opts =  new TestContainerStartOpts(optOverrides);
    const args = [
        opts.imageWithTag(),
        "--name", opts.containerName,
    ];

    // Spawn the docker container
    t.comment(`spawning container [${opts.imageName}:${opts.tagName}] with name [${opts.containerName}]...`);
    const containerProcess = spawn(
        opts.dockerBinPath,
        args,
        { detached: true, stdio: "pipe"},
    );

    let resolved = false;
    let stdoutListener;
    let stderrListener;

    const makeListener = (
        type: "stdout" | "stderr",
        emitter: Readable | null,
        expected: string,
        resolve: (res: ContainerAndOpts) => void,
        reject: (err?: Error) => void,
    ) => {
        if (!emitter) {
            return () => reject(new Error(`[${type}] pipe was not Readable`));
        }

        return (line: string) => {
            if (!line.includes(expected)) { return; }

            if (type === "stdout" && stdoutListener) { emitter.removeListener("data", stdoutListener); }
            if (type === "stderr" && stderrListener) { emitter.removeListener("data", stderrListener); }

            if (!resolved) {
                resolve({containerProcess, opts});
            }
            resolved = true;
        };
    };

    // Wait until process is listening on the given socket port
    const promise = new Promise((resolve, reject) => {
        // If there's a waitFor specified then we're going to have to listen before we return

        if (opts.waitFor && opts.waitFor.stdout) {
            // TODO: wait for output on stdout
            stdoutListener = makeListener("stdout", containerProcess.stdout, opts.waitFor.stdout, resolve, reject);
            if (containerProcess.stdout) { containerProcess.stdout.on("data", stdoutListener); }
            return;
        }

        if (opts.waitFor && opts.waitFor.stderr) {
            // TODO: wait for output on stderr
            stderrListener = makeListener("stderr", containerProcess.stderr, opts.waitFor.stderr, resolve, reject);
            if (containerProcess.stderr) { containerProcess.stderr.on("data", stderrListener); }
            return;
        }

        resolve({containerProcess, opts});
    });

    return timeout(promise, opts.startTimeoutMs)
        .catch(err => {
            // If we timed out clean up some waiting stuff, shutdown the process
            // since none of the listeners may have triggered, clean them up
            if (err instanceof TimeoutError) {
                if (containerProcess.stdout) { containerProcess.stdout.on("data", stdoutListener); }
                if (containerProcess.stderr) { containerProcess.stderr.on("data", stderrListener); }
                containerProcess.kill();
            }

            // Re-throw the error
            throw err;
        });
}

// Stop a running container
export function stopContainer(t: Test, opts: TestContainerStartOpts): Promise<number> {
    const args = ["stop", opts.containerName];

    // Spawn the docker container
    t.comment(`attempting to stop [${opts.containerName}]...`);
    const dockerKillProcess = spawn(
        opts.dockerBinPath,
        args,
        { detached: true, stdio: "ignore"},
    );

    const promise = new Promise((resolve, reject) => {
        dockerKillProcess.on("close", code => {
            resolve(code);
        });
    });

    return timeout(promise, opts.stopTimeoutMs);
}

// Utility function to start a postgres instance
const POSTGRES_IMAGE_NAME = "postgres";
export function startContainerizedPostgresTest(
    test: any,
    cb: (cao: ContainerAndOpts) => void,
    tagName?: string,
) {
    tagName = tagName || "latest-alpine";
    test("Starting postgres instance", (t: Test) => {
        startContainer(t, {imageName: POSTGRES_IMAGE_NAME, tagName})
            .then(containerAndOpts => {
                t.comment(`Successfully started postgres container [${containerAndOpts.opts.containerName}]`);
                cb(containerAndOpts);
            })
            .then(() => t.end())
            .catch(err => t.end(err));
    });
}

// Utility function to stop a postgres instance
export function stopContainerizedPostgresTest(test: any, containerAndOpts: ContainerAndOpts | null) {
    if (!containerAndOpts) {
        throw new Error("no container w/ opts object provided, can't stop container");
    }

    const opts = containerAndOpts.opts;

    test(`Stopping postgres instance in container [${opts.containerName}]`, (t: Test) => {
        stopContainer(t, opts)
            .then(code => t.ok(`successfully stopped container [${opts.containerName}], with code [${code}]`))
            .then(() => t.end())
            .catch(err => t.end(err));
    });
}
