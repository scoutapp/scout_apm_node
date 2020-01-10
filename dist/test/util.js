"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const tmp = require("tmp-promise");
const express = require("express");
const randomstring = require("randomstring");
const promise_timeout_1 = require("promise-timeout");
const child_process_1 = require("child_process");
const Constants = require("../lib/constants");
const external_process_1 = require("../lib/agents/external-process");
const web_1 = require("../lib/agent-downloaders/web");
const types_1 = require("../lib/types");
const config_1 = require("../lib/types/config");
const lib_1 = require("../lib");
const requests_1 = require("../lib/protocol/v1/requests");
// Wait a little longer for requests that use express
exports.EXPRESS_TEST_TIMEOUT = 2000;
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
        .then(() => t.end(err));
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
        this.dockerBinPath = "/bin/docker";
        // Phrases that should be waited for before the container is "started"
        this.waitFor = {};
        this.startTimeoutMs = 5000;
        this.stopTimeoutMs = 5000;
        this.tagName = "latest";
        this.env = process.env;
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
            if (opts.stopTimeoutMs) {
                this.stopTimeoutMs = opts.stopTimeoutMs;
            }
            if (opts.env) {
                this.env = opts.env;
            }
        }
        // Generate a random container name if one wasn't provided
        if (!this.containerName) {
            this.containerName = `test-${this.imageName}-${randomstring()}`;
        }
    }
    imageWithTag() {
        return `${this.imageName}:${this.tagName}`;
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
    const args = [
        opts.imageWithTag(),
        "--name", opts.containerName,
    ];
    // Spawn the docker container
    t.comment(`spawning container [${opts.imageName}:${opts.tagName}] with name [${opts.containerName}]...`);
    const containerProcess = child_process_1.spawn(opts.dockerBinPath, args, { detached: true, stdio: "pipe" });
    let resolved = false;
    let stdoutListener;
    let stderrListener;
    const makeListener = (type, emitter, expected, resolve, reject) => {
        if (!emitter) {
            return () => reject(new Error(`[${type}] pipe was not Readable`));
        }
        return (line) => {
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
        if (opts.waitFor && opts.waitFor.stdout) {
            // TODO: wait for output on stdout
            stdoutListener = makeListener("stdout", containerProcess.stdout, opts.waitFor.stdout, resolve, reject);
            if (containerProcess.stdout) {
                containerProcess.stdout.on("data", stdoutListener);
            }
            return;
        }
        if (opts.waitFor && opts.waitFor.stderr) {
            // TODO: wait for output on stderr
            stderrListener = makeListener("stderr", containerProcess.stderr, opts.waitFor.stderr, resolve, reject);
            if (containerProcess.stderr) {
                containerProcess.stderr.on("data", stderrListener);
            }
            return;
        }
        resolve({ containerProcess, opts });
    });
    return promise_timeout_1.timeout(promise, opts.startTimeoutMs)
        .catch(err => {
        // If we timed out clean up some waiting stuff, shutdown the process
        // since none of the listeners may have triggered, clean them up
        if (err instanceof promise_timeout_1.TimeoutError) {
            if (containerProcess.stdout) {
                containerProcess.stdout.on("data", stdoutListener);
            }
            if (containerProcess.stderr) {
                containerProcess.stderr.on("data", stderrListener);
            }
            containerProcess.kill();
        }
        // Re-throw the error
        throw err;
    });
}
exports.startContainer = startContainer;
// Stop a running container
function stopContainer(t, opts) {
    const args = ["stop", opts.containerName];
    // Spawn the docker container
    t.comment(`attempting to stop [${opts.containerName}]...`);
    const dockerKillProcess = child_process_1.spawn(opts.dockerBinPath, args, { detached: true, stdio: "ignore" });
    const promise = new Promise((resolve, reject) => {
        dockerKillProcess.on("close", code => {
            resolve(code);
        });
    });
    return promise_timeout_1.timeout(promise, opts.stopTimeoutMs);
}
exports.stopContainer = stopContainer;
// Utility function to start a postgres instance
const POSTGRES_IMAGE_NAME = "postgres";
function startContainerizedPostgresTest(test, cb, tagName) {
    tagName = tagName || "latest-alpine";
    test("Starting postgres instance", (t) => {
        startContainer(t, { imageName: POSTGRES_IMAGE_NAME, tagName })
            .then(containerAndOpts => {
            t.comment(`Successfully started postgres container [${containerAndOpts.opts.containerName}]`);
            cb(containerAndOpts);
        })
            .then(() => t.end())
            .catch(err => t.end(err));
    });
}
exports.startContainerizedPostgresTest = startContainerizedPostgresTest;
// Utility function to stop a postgres instance
function stopContainerizedPostgresTest(test, containerAndOpts) {
    if (!containerAndOpts) {
        throw new Error("no container w/ opts object provided, can't stop container");
    }
    const opts = containerAndOpts.opts;
    test(`Stopping postgres instance in container [${opts.containerName}]`, (t) => {
        stopContainer(t, opts)
            .then(code => t.ok(`successfully stopped container [${opts.containerName}], with code [${code}]`))
            .then(() => t.end())
            .catch(err => t.end(err));
    });
}
exports.stopContainerizedPostgresTest = stopContainerizedPostgresTest;
