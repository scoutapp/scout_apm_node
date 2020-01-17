"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const tmp = require("tmp-promise");
const express = require("express");
const net = require("net");
const randomstring_1 = require("randomstring");
const promise_timeout_1 = require("promise-timeout");
const child_process_1 = require("child_process");
const pg_1 = require("pg");
const mysql_1 = require("mysql");
const Constants = require("../lib/constants");
const external_process_1 = require("../lib/agents/external-process");
const web_1 = require("../lib/agent-downloaders/web");
const types_1 = require("../lib/types");
const config_1 = require("../lib/types/config");
const lib_1 = require("../lib");
const requests_1 = require("../lib/protocol/v1/requests");
const getPort = require("get-port");
// Wait a little longer for requests that use express
exports.EXPRESS_TEST_TIMEOUT_MS = 2000;
// The timeouts for PG & MSQL assume an instance is *already running*
// for control over the amount of start time alotted see `startTimeoutMs`
exports.PG_TEST_TIMEOUT_MS = 3000;
exports.MYSQL_TEST_TIMEOUT_MS = 3000;
exports.DASHBOARD_SEND_TIMEOUT_MS = 1000 * 60 * 3; // 3 minutes
const POSTGRES_STARTUP_MESSAGE = "database system is ready to accept connections";
// Helper for downloading and creating an agent
function bootstrapExternalProcessAgent(t, rawVersion, opts) {
    const downloadOpts = {
        cacheDir: Constants.DEFAULT_CORE_AGENT_DOWNLOAD_CACHE_DIR,
        updateCache: true,
    };
    const downloader = new web_1.default();
    const version = new types_1.CoreAgentVersion(rawVersion);
    let uri;
    let binPath;
    // Download binary
    return downloader
        .download(version, downloadOpts)
        .then(bp => binPath = bp)
        // Create temporary directory for socket
        .then(() => tmp.dir({ prefix: "core-agent-test-" }))
        .then(result => {
        const socketPath = path.join(result.path, "core-agent.sock");
        uri = `unix://${socketPath}`;
    })
        // Start process
        .then(() => {
        let procOpts = new types_1.ProcessOptions(binPath, uri);
        if (opts && opts.buildProcOpts) {
            procOpts = opts.buildProcOpts(binPath, uri);
        }
        t.comment(`creating external process agent @ [${uri}]...`);
        return new external_process_1.default(procOpts);
    });
}
exports.bootstrapExternalProcessAgent = bootstrapExternalProcessAgent;
// Helper for initializing a bootstrapped agent
function initializeAgent(t, agent, appName, agentKey, appVersion, apiVersion = types_1.APIVersion.V1) {
    t.comment(`initializing agent with appName [${appName}]`);
    return agent.start()
        .then(() => agent.connect())
        .then(() => agent.send(new requests_1.V1Register(appName, agentKey, apiVersion)))
        .then(() => agent);
}
exports.initializeAgent = initializeAgent;
function waitMs(ms, t) {
    return new Promise(resolve => {
        setTimeout(() => {
            if (t) {
                t.comment(`...waited ${ms}ms`);
            }
            resolve();
        }, ms);
    });
}
exports.waitMs = waitMs;
function waitMinutes(mins, t) {
    return waitMs(mins * 60 * 1000, t);
}
exports.waitMinutes = waitMinutes;
// Helper function for cleaning up an agent processe and passing/failing a test
function cleanup(t, agent, err) {
    return agent.getProcess()
        .then(process => process.kill())
        .then(() => t.end(err));
}
exports.cleanup = cleanup;
// Helper that waits for agent buffer to flush
function waitForAgentBufferFlush(t) {
    const interval = Constants.AGENT_BUFFER_TIME_MS;
    if (t) {
        t.comment(`Waiting for agent buffer time (${interval / Constants.MINUTE_MS} minutes)...`);
    }
    return waitMs(interval);
}
exports.waitForAgentBufferFlush = waitForAgentBufferFlush;
// Helper function to clean up an official (user-facing) scout instance
function shutdownScout(t, scout, err) {
    return scout.shutdown()
        .then(() => {
        if (err) {
            console.log("ERROR:", err);
        } // tslint:disable-line no-console
        t.end(err);
    });
}
exports.shutdownScout = shutdownScout;
// Make a simple express application that just returns
// some JSON ({status: "success"}) after waiting a certain amount of milliseconds if provided
function simpleExpressApp(middleware, delayMs = 0) {
    const app = express();
    if (middleware) {
        app.use(middleware);
    }
    app.get("/", (req, res) => {
        waitMs(delayMs)
            .then(() => res.send({ status: "success" }));
    });
    return app;
}
exports.simpleExpressApp = simpleExpressApp;
// Make an express app with a route with a dynamic segment which returns
// some JSON ({status: "success", segment: <what you sent>}) after waiting a certain amount of milliseconds if provided
function simpleDynamicSegmentExpressApp(middleware, delayMs = 0) {
    const app = express();
    if (middleware) {
        app.use(middleware);
    }
    app.get("/", (req, res) => {
        waitMs(delayMs)
            .then(() => res.send({ status: "success" }));
    });
    app.get("/dynamic/:segment", (req, res) => {
        waitMs(delayMs)
            .then(() => res.send({
            segment: req.params.segment,
            status: "success",
        }));
    });
    app.post("/echo-by-post", (req, res) => {
        waitMs(delayMs)
            .then(() => res.send({
            data: req.body,
            status: "success",
        }));
    });
    return app;
}
exports.simpleDynamicSegmentExpressApp = simpleDynamicSegmentExpressApp;
// An express application which errors on the /
function simpleErrorApp(middleware, delayMs = 0) {
    const app = express();
    app.use(middleware);
    app.get("/", (req, res) => {
        throw new Error("Expected application error (simpleErrorApp)");
    });
    return app;
}
exports.simpleErrorApp = simpleErrorApp;
// Test that a given variable is effectively overlaid in the configuration
function testConfigurationOverlay(t, opts) {
    const { appKey, envValue, expectedValue } = opts;
    const envKey = types_1.convertCamelCaseToEnvVar(appKey);
    const envValueIsSet = envKey in process.env;
    const defaultConfig = types_1.buildScoutConfiguration();
    t.assert(defaultConfig, "defaultConfig was generated");
    // Only perform this check if we're not currently overriding the value in ENV *during* this test
    // it won't be the default, because we've set it to be so
    if (appKey in config_1.DEFAULT_SCOUT_CONFIGURATION && !envValueIsSet) {
        t.equals(defaultConfig[appKey], config_1.DEFAULT_SCOUT_CONFIGURATION[appKey], `config [${appKey}] matches default`);
    }
    // Set key at the application level
    const appConfig = {};
    appConfig[appKey] = expectedValue;
    const appOnlyConfig = types_1.buildScoutConfiguration(appConfig);
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
    const envOverrideConfig = types_1.buildScoutConfiguration(appConfig);
    t.assert(envOverrideConfig, "envOverrideConfig was generated");
    t.deepEquals(envOverrideConfig[appKey], expectedValue, `config [${appKey}] matches app value when set by app`);
    // Reset the env value
    // Set key to the previous value if it was present
    if (wasPresent) {
        process.env[envKey] = previousKeyValue;
    }
    else {
        delete process.env[envKey];
    }
}
exports.testConfigurationOverlay = testConfigurationOverlay;
function buildCoreAgentSocketResponse(json) {
    const buf = Buffer.concat([
        Buffer.allocUnsafe(4),
        Buffer.from(json),
    ]);
    buf.writeUInt32BE(json.length, 0);
    return buf;
}
exports.buildCoreAgentSocketResponse = buildCoreAgentSocketResponse;
function buildTestScoutInstance(configOverride, options) {
    const cfg = types_1.buildScoutConfiguration(Object.assign({ allowShutdown: true, monitor: true }, configOverride));
    return new lib_1.Scout(cfg, options);
}
exports.buildTestScoutInstance = buildTestScoutInstance;
class TestContainerStartOpts {
    constructor(opts) {
        this.dockerBinPath = "/usr/bin/docker";
        // Phrases that should be waited for before the container is "started"
        this.waitFor = {};
        this.startTimeoutMs = 5000;
        this.killTimeoutMs = 5000;
        this.tagName = "latest";
        this.envBinding = {};
        this.portBinding = {};
        if (opts) {
            if (opts.dockerBinPath) {
                this.dockerBinPath = opts.dockerBinPath;
            }
            if (opts.waitFor) {
                this.waitFor = opts.waitFor;
            }
            if (opts.imageName) {
                this.imageName = opts.imageName;
            }
            if (opts.tagName) {
                this.tagName = opts.tagName;
            }
            if (opts.containerName) {
                this.containerName = opts.containerName;
            }
            if (opts.startTimeoutMs) {
                this.startTimeoutMs = opts.startTimeoutMs;
            }
            if (opts.killTimeoutMs) {
                this.killTimeoutMs = opts.killTimeoutMs;
            }
            if (opts.envBinding) {
                this.envBinding = opts.envBinding;
            }
            if (opts.portBinding) {
                this.portBinding = opts.portBinding;
            }
        }
        // Generate a random container name if one wasn't provided
        if (!this.containerName) {
            this.containerName = `test-${this.imageName}-${randomstring_1.generate(5)}`;
        }
    }
    imageWithTag() {
        return `${this.imageName}:${this.tagName}`;
    }
    setExecutedStartCommand(cmd) {
        this.executedStartCommand = cmd;
    }
}
exports.TestContainerStartOpts = TestContainerStartOpts;
/**
 * Start a container in a child process for use with tests
 *
 * @param {Test} t - the test (tape) instance
 * @param {string} image - the image name (ex. "postgres")
 * @param {string} tag - the image tag (ex. "12")
 * @returns {Promise<ChildProcess>} A promise that resolves to the spawned child process
 */
function startContainer(t, optOverrides) {
    const opts = new TestContainerStartOpts(optOverrides);
    // Build port mapping arguments
    const portMappingArgs = [];
    Object.entries(opts.portBinding).forEach(([containerPort, localPort]) => {
        portMappingArgs.push("-p");
        portMappingArgs.push(`${localPort}:${containerPort}`);
    });
    // Build env mapping arguments
    const envMappingArgs = [];
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
    const containerProcess = child_process_1.spawn(opts.dockerBinPath, args, { detached: true, stdio: "pipe" });
    opts.setExecutedStartCommand(`${opts.dockerBinPath} ${args.join(" ")}`);
    let resolved = false;
    let stdoutListener;
    let stderrListener;
    const makeListener = (type, emitter, expected, resolve, reject) => {
        if (!emitter) {
            return () => reject(new Error(`[${type}] pipe was not Readable`));
        }
        return (line) => {
            line = line.toString();
            if (!line.includes(expected)) {
                return;
            }
            if (type === "stdout" && stdoutListener) {
                emitter.removeListener("data", stdoutListener);
            }
            if (type === "stderr" && stderrListener) {
                emitter.removeListener("data", stderrListener);
            }
            if (!resolved) {
                resolve({ containerProcess, opts });
            }
            resolved = true;
        };
    };
    // Wait until process is listening on the given socket port
    const promise = new Promise((resolve, reject) => {
        // If there's a waitFor specified then we're going to have to listen before we return
        // Hook up listener to test travis ci
        // tslint:disable-next-line no-console
        containerProcess.stdout.on("data", data => console.log("stdout => ", data.toString()));
        // tslint:disable-next-line no-console
        containerProcess.stderr.on("data", data => console.log("stderr => ", data.toString()));
        // Wait for specific output on stdout
        if (opts.waitFor && opts.waitFor.stdout) {
            stdoutListener = makeListener("stdout", containerProcess.stdout, opts.waitFor.stdout, resolve, reject);
            if (containerProcess.stdout) {
                containerProcess.stdout.on("data", stdoutListener);
            }
            return;
        }
        // Wait for specific output on stderr
        if (opts.waitFor && opts.waitFor.stderr) {
            stderrListener = makeListener("stderr", containerProcess.stderr, opts.waitFor.stderr, resolve, reject);
            if (containerProcess.stderr) {
                containerProcess.stderr.on("data", stderrListener);
            }
            return;
        }
        // Wait for a given amount of time
        if (opts.waitFor && opts.waitFor.milliseconds) {
            waitMs(opts.waitFor.milliseconds)
                .then(() => resolve({ containerProcess, opts }));
            return;
        }
        containerProcess.on("close", code => {
            if (code !== 0) {
                t.comment("daemon failed to start container, piping output to stdout...");
                if (containerProcess.stdout) {
                    containerProcess.stdout.pipe(process.stdout);
                }
                t.comment(`command: [${opts.executedStartCommand}]`);
                reject(new Error(`Failed to start container (code ${code}), output will be piped to stdout`));
                return;
            }
            resolve({ containerProcess, opts });
        });
    });
    console.log(`timing out after [${opts.startTimeoutMs}ms]`); // tslint:disable-line no-console
    return promise_timeout_1.timeout(promise, opts.startTimeoutMs)
        .catch(err => {
        // If we timed out clean up some waiting stuff, shutdown the process
        // since none of the listeners may have triggered, clean them up
        if (err instanceof promise_timeout_1.TimeoutError) {
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
exports.startContainer = startContainer;
// Kill a running container
function killContainer(t, opts) {
    const args = ["kill", opts.containerName];
    // Spawn the docker container
    t.comment(`attempting to kill [${opts.containerName}]...`);
    const dockerKillProcess = child_process_1.spawn(opts.dockerBinPath, args, { detached: true, stdio: "ignore" });
    const promise = new Promise((resolve, reject) => {
        dockerKillProcess.on("close", code => {
            resolve(code);
        });
    });
    return promise_timeout_1.timeout(promise, opts.killTimeoutMs);
}
exports.killContainer = killContainer;
const POSTGRES_IMAGE_NAME = "postgres";
const POSTGRES_IMAGE_TAG = "alpine";
// Utility function to start a postgres instance
function startContainerizedPostgresTest(test, cb, containerEnv, tagName) {
    tagName = tagName || POSTGRES_IMAGE_TAG;
    const envBinding = containerEnv || {};
    test("Starting postgres instance", (t) => {
        let port;
        let containerAndOpts;
        getPort()
            .then(p => port = p)
            .then(() => {
            const portBinding = { 5432: port };
            return startContainer(t, {
                imageName: POSTGRES_IMAGE_NAME,
                tagName,
                portBinding,
                envBinding,
                waitFor: { stdout: POSTGRES_STARTUP_MESSAGE },
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
exports.startContainerizedPostgresTest = startContainerizedPostgresTest;
// Generic function for making a test that stops a containered instance of some dependency
function stopContainerizedInstanceTest(test, provider, name) {
    test(`Stopping containerized ${name} instance...`, (t) => {
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
exports.stopContainerizedInstanceTest = stopContainerizedInstanceTest;
// Utility function to stop a postgres instance
function stopContainerizedPostgresTest(test, provider) {
    stopContainerizedInstanceTest(test, provider, "postgres");
}
exports.stopContainerizedPostgresTest = stopContainerizedPostgresTest;
function makeConnectedPGClient(provider) {
    const cao = provider();
    if (!cao) {
        return Promise.reject(new Error("no CAO in provider"));
    }
    const port = cao.opts.portBinding[5432];
    const client = new pg_1.Client({
        user: "postgres",
        host: "localhost",
        database: "postgres",
        password: "postgres",
        port,
    });
    return client.connect().then(() => client);
}
exports.makeConnectedPGClient = makeConnectedPGClient;
// A server that does nothing but collect the clients that connect to it
function createClientCollectingServer() {
    const clients = [];
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
exports.createClientCollectingServer = createClientCollectingServer;
const MYSQL_IMAGE_NAME = "mysql";
const MYSQL_IMAGE_TAG = "5.7.29";
// mysql takes this long to start up, can't wait for output because
// even when it says it's ready to accept connections it will drop them.
// this startup time was arrived at by trial and error and may need to be adjusted.
const MYSQL_CONTAINER_STARTUP_TIME_MS = process.env.CI ? 600000 : 15000;
const MYSQL_STARTUP_MESSAGE = "ready for connections";
const MYSQL_CONTAINER_DEFAULT_ENV = {
    MYSQL_ROOT_PASSWORD: "mysql",
};
// Utility function to start a postgres instance
function startContainerizedMySQLTest(test, cb, containerEnv, tagName) {
    tagName = tagName || MYSQL_IMAGE_TAG;
    const envBinding = Object.assign({}, MYSQL_CONTAINER_DEFAULT_ENV, containerEnv);
    // We'll need to set the timeout of the test to startup time + 1s to prevent test timeout
    test("Starting mysql instance", { timeout: MYSQL_CONTAINER_STARTUP_TIME_MS + 1000 }, (t) => {
        let port;
        let containerAndOpts;
        getPort()
            .then(p => port = p)
            .then(() => {
            const portBinding = { 3306: port };
            return startContainer(t, {
                imageName: MYSQL_IMAGE_NAME,
                tagName,
                portBinding,
                envBinding,
                waitFor: { milliseconds: MYSQL_CONTAINER_STARTUP_TIME_MS },
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
exports.startContainerizedMySQLTest = startContainerizedMySQLTest;
// Utility function to stop a mysql instance
function stopContainerizedMySQLTest(test, provider) {
    stopContainerizedInstanceTest(test, provider, "msyql");
}
exports.stopContainerizedMySQLTest = stopContainerizedMySQLTest;
// Helper for creating a connected connection for MySQL
function makeConnectedMySQLConnection(provider) {
    const cao = provider();
    if (!cao) {
        return Promise.reject(new Error("no CAO in provider"));
    }
    const port = cao.opts.portBinding[3306];
    const conn = mysql_1.createConnection({
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
exports.makeConnectedMySQLConnection = makeConnectedMySQLConnection;
