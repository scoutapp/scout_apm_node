import * as path from "path";
import * as tmp from "tmp-promise";
import * as express from "express";
import * as net from "net";
import { Application, Request, Response } from "express";
import { generate as generateRandomString } from "randomstring";
import { timeout, TimeoutError } from "promise-timeout";
import { ChildProcess, spawn, SpawnOptions } from "child_process";
import { EventEmitter } from "events";
import { Readable } from "stream";
import { Client } from "pg";
import { Connection, createConnection as createMySQLConnection } from "mysql";

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

const getPort = require("get-port");

// Wait a little longer for requests that use express
export const EXPRESS_TEST_TIMEOUT_MS = 2000;
// The timeouts for PG & MSQL assume an instance is *already running*
// for control over the amount of start time alotted see `startTimeoutMs`
export const PG_TEST_TIMEOUT_MS = 3000;
export const MYSQL_TEST_TIMEOUT_MS = 3000;
export const DASHBOARD_SEND_TIMEOUT_MS = 1000 * 60 * 3; // 3 minutes

const POSTGRES_STARTUP_MESSAGE = "database system is ready to accept connections";

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
        .then(() => {
            if (err) { console.log("ERROR:", err); } // tslint:disable-line no-console
            t.end(err);
        });
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

export interface WaitForConfig {
    // Wait for output on stdout
    stdout?: string;
    // Wait for output on stderr
    stderr?: string;
    // Wait a certain number of milliseconds
    milliseconds?: number;
}

export class TestContainerStartOpts {
    public readonly dockerBinPath: string = "/usr/bin/docker";
    // Phrases that should be waited for before the container is "started"
    public readonly waitFor: WaitForConfig = {};
    public readonly startTimeoutMs: number = 5000;
    public readonly killTimeoutMs: number = 5000;

    public imageName: string;
    public tagName: string = "latest";
    public containerName: string;
    public envBinding: object = {};
    public executedStartCommand: string;
    public portBinding: {[key: number]: number} = {};

    constructor(opts: Partial<TestContainerStartOpts>) {
        if (opts) {
            if (opts.dockerBinPath) { this.dockerBinPath = opts.dockerBinPath; }
            if (opts.waitFor) { this.waitFor = opts.waitFor; }
            if (opts.imageName) { this.imageName = opts.imageName; }
            if (opts.tagName) { this.tagName = opts.tagName; }
            if (opts.containerName) { this.containerName = opts.containerName; }
            if (opts.startTimeoutMs) { this.startTimeoutMs = opts.startTimeoutMs; }
            if (opts.killTimeoutMs) { this.killTimeoutMs = opts.killTimeoutMs; }
            if (opts.envBinding) { this.envBinding = opts.envBinding; }
            if (opts.portBinding) { this.portBinding = opts.portBinding; }
        }

        // Generate a random container name if one wasn't provided
        if (!this.containerName) {
            this.containerName = `test-${this.imageName}-${generateRandomString(5)}`;
        }
    }

    public imageWithTag(): string {
        return `${this.imageName}:${this.tagName}`;
    }

    public setExecutedStartCommand(cmd: string) {
        this.executedStartCommand = cmd;
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

    // Build port mapping arguments
    const portMappingArgs: string[] = [];
    Object.entries(opts.portBinding).forEach(([containerPort, localPort]) => {
        portMappingArgs.push("-p");
        portMappingArgs.push(`${localPort}:${containerPort}`);
    });

    // Build env mapping arguments
    const envMappingArgs: string[] = [];
    Object.entries(opts.envBinding).forEach(([envVarName, value]) => {
        envMappingArgs.push("-e");
        envMappingArgs.push(`${envVarName}=${value}`);
    });

    const args = [
        "run",
        "--name", opts.containerName,
        ...portMappingArgs,
        ...envMappingArgs,
        opts.imageWithTag(),
    ];

    // Spawn the docker container
    t.comment(`spawning container [${opts.imageName}:${opts.tagName}] with name [${opts.containerName}]...`);
    const containerProcess = spawn(
        opts.dockerBinPath,
        args,
        {detached: true, stdio: "pipe"} as SpawnOptions,
    );
    opts.setExecutedStartCommand(`${opts.dockerBinPath} ${args.join(" ")}`);

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

        return (line: string | Buffer) => {
            line = line.toString();
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

        // Hook up listener to test travis ci
        containerProcess!.stdout!.on("data", data => console.log("stdout => ", data.toString()));
        containerProcess!.stderr!.on("data", data => console.log("stderr => ", data.toString()));

        // Wait for specific output on stdout
        if (opts.waitFor && opts.waitFor.stdout) {
            stdoutListener = makeListener("stdout", containerProcess.stdout, opts.waitFor.stdout, resolve, reject);
            if (containerProcess.stdout) { containerProcess.stdout.on("data", stdoutListener); }
            return;
        }

        // Wait for specific output on stderr
        if (opts.waitFor && opts.waitFor.stderr) {
            stderrListener = makeListener("stderr", containerProcess.stderr, opts.waitFor.stderr, resolve, reject);
            if (containerProcess.stderr) { containerProcess.stderr.on("data", stderrListener); }
            return;
        }

        // Wait for a given amount of time
        if (opts.waitFor && opts.waitFor.milliseconds) {
            waitMs(opts.waitFor.milliseconds)
                .then(() => resolve({containerProcess, opts}));
            return;
        }

        containerProcess.on("close", code => {
            if (code !== 0) {
                t.comment("daemon failed to start container, piping output to stdout...");
                if (containerProcess.stdout) { containerProcess.stdout.pipe(process.stdout); }
                t.comment(`command: [${opts.executedStartCommand}]`);
                reject(new Error(`Failed to start container (code ${code}), output will be piped to stdout`));
                return;
            }

            resolve({containerProcess, opts});
        });

    });

    console.log(`timing out after [${opts.startTimeoutMs}ms]`); // tslint:disable-line no-console
    return timeout(promise, opts.startTimeoutMs)
        .catch(err => {
            // If we timed out clean up some waiting stuff, shutdown the process
            // since none of the listeners may have triggered, clean them up
            if (err instanceof TimeoutError) {
                if (opts.waitFor && opts.waitFor.stdout && containerProcess.stdout) {
                    containerProcess.stdout.on("data", stdoutListener);
                }

                if (opts.waitFor && opts.waitFor.stderr && containerProcess.stderr) {
                    containerProcess.stderr.on("data", stderrListener);
                }

                containerProcess.kill();
            }

            // Re-throw the error
            throw err;
        });
}

// Kill a running container
export function killContainer(t: Test, opts: TestContainerStartOpts): Promise<number> {
    const args = ["kill", opts.containerName];

    // Spawn the docker container
    t.comment(`attempting to kill [${opts.containerName}]...`);
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

    return timeout(promise, opts.killTimeoutMs);
}

const POSTGRES_IMAGE_NAME = "postgres";
const POSTGRES_IMAGE_TAG = "alpine";

// Utility function to start a postgres instance
export function startContainerizedPostgresTest(
    test: any,
    cb: (cao: ContainerAndOpts) => void,
    containerEnv?: object,
    tagName?: string,
) {
    tagName = tagName || POSTGRES_IMAGE_TAG;
    const envBinding = containerEnv || {};

    test("Starting postgres instance", (t: Test) => {
        let port: number;
        let containerAndOpts: ContainerAndOpts;

        getPort()
            .then(p => port = p)
            .then(() => {
                const portBinding = {5432: port};
                return startContainer(t, {
                    imageName: POSTGRES_IMAGE_NAME,
                    tagName,
                    portBinding,
                    envBinding,
                    waitFor: {stdout: POSTGRES_STARTUP_MESSAGE},
                });
            })
            .then(cao => containerAndOpts = cao)
            .then(() => {
                const opts = containerAndOpts.opts;
                t.comment(`Started container [${opts.containerName}] on local port ${opts.portBinding[5432]}`);
                cb(containerAndOpts);
            })
            .then(() => t.end())
            .catch(err => {
                if (containerAndOpts) {
                    return killContainer(t, containerAndOpts.opts)
                        .then(() => t.end(err));
                }

                return t.end(err);
            });
    });
}

// Generic function for making a test that stops a containered instance of some dependency
export function stopContainerizedInstanceTest(test: any, provider: () => ContainerAndOpts | null, name: string) {
    test(`Stopping containerized ${name} instance...`, (t: Test) => {
        const containerAndOpts = provider();
        if (!containerAndOpts) {
            throw new Error("no container w/ opts object provided, can't stop container");
        }

        const opts = containerAndOpts.opts;

        killContainer(t, opts)
            .then(code => t.ok(`successfully stopped container [${opts.containerName}], with code [${code}]`))
            .then(() => t.end())
            .catch(err => t.end(err));
    });
}

// Utility function to stop a postgres instance
export function stopContainerizedPostgresTest(test: any, provider: () => ContainerAndOpts | null) {
    stopContainerizedInstanceTest(test, provider, "postgres");
}

export function makeConnectedPGClient(provider: () => ContainerAndOpts | null): Promise<Client> {
    const cao = provider();
    if (!cao) { return Promise.reject(new Error("no CAO in provider")); }

    const port: number = cao.opts.portBinding[5432];
    const client = new Client({
        user: "postgres",
        host: "localhost",
        database: "postgres",
        password: "postgres",
        port,
    });

    return client.connect().then(() => client);
}

type ServerShutdownFn = () => void;

// A server that does nothing but collect the clients that connect to it
export function createClientCollectingServer(): [net.Server, ServerShutdownFn] {
    const clients: net.Socket[] = [];
    const server = net.createServer((c) => {
        // When a client connects, update the clients list
        clients.push(c);
    });

    const shutdown = () => {
        // Disconnect all the clients and close the server
        clients.forEach(c => c.end());
        server.close();
    };

    return [server, shutdown];
}

const MYSQL_IMAGE_NAME = "mysql";
const MYSQL_IMAGE_TAG = "5.7.29";
// mysql takes this long to start up, can't wait for output because
// even when it says it's ready to accept connections it will drop them.
// this startup time was arrived at by trial and error and may need to be adjusted.
const MYSQL_CONTAINER_STARTUP_TIME_MS = 15000;
const MYSQL_STARTUP_MESSAGE = "ready for connections";
const MYSQL_CONTAINER_DEFAULT_ENV = {
    MYSQL_ROOT_PASSWORD: "mysql",
};

// Utility function to start a postgres instance
export function startContainerizedMySQLTest(
    test: any,
    cb: (cao: ContainerAndOpts) => void,
    containerEnv?: object,
    tagName?: string,
) {
    tagName = tagName || MYSQL_IMAGE_TAG;
    const envBinding = Object.assign({}, MYSQL_CONTAINER_DEFAULT_ENV, containerEnv);

    // We'll need to set the timeout of the test to startup time + 1s to prevent test timeout
    test("Starting mysql instance", {timeout: MYSQL_CONTAINER_STARTUP_TIME_MS + 1000}, (t: Test) => {
        let port: number;
        let containerAndOpts: ContainerAndOpts;

        getPort()
            .then(p => port = p)
            .then(() => {
                const portBinding = {3306: port};
                return startContainer(t, {
                    imageName: MYSQL_IMAGE_NAME,
                    tagName,
                    portBinding,
                    envBinding,
                    waitFor: {milliseconds: MYSQL_CONTAINER_STARTUP_TIME_MS},
                    startTimeoutMs: MYSQL_CONTAINER_STARTUP_TIME_MS,
                });
            })
            .then(cao => containerAndOpts = cao)
            .then(() => {
                const opts = containerAndOpts.opts;
                t.comment(`Started container [${opts.containerName}] on local port ${opts.portBinding[3306]}`);
                cb(containerAndOpts);
            })
            .then(() => t.end())
            .catch(err => {
                if (containerAndOpts) {
                    return killContainer(t, containerAndOpts.opts)
                        .then(() => t.end(err));
                }

                return t.end(err);
            });
    });
}

// Utility function to stop a mysql instance
export function stopContainerizedMySQLTest(test: any, provider: () => ContainerAndOpts | null) {
    stopContainerizedInstanceTest(test, provider, "msyql");
}

// Helper for creating a connected connection for MySQL
export function makeConnectedMySQLConnection(provider: () => ContainerAndOpts | null): Promise<Connection> {
    const cao = provider();
    if (!cao) { return Promise.reject(new Error("no CAO in provider")); }

    const port: number = cao.opts.portBinding[3306];
    const conn = createMySQLConnection({
        user: "root",
        password: "mysql",
        host: "localhost",
        port,
    });

    return new Promise((resolve, reject) => {
        conn.connect((err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(conn);
        });
    });
}
