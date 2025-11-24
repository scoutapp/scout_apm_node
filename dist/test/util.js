"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestContainerStartOpts = exports.MEMORY_LEAK_TEST_TIMEOUT_MS = exports.DASHBOARD_SEND_TIMEOUT_MS = exports.MYSQL_TEST_TIMEOUT_MS = exports.PG_TEST_TIMEOUT_MS = exports.EXPRESS_TEST_TIMEOUT_MS = void 0;
exports.bootstrapExternalProcessAgent = bootstrapExternalProcessAgent;
exports.initializeAgent = initializeAgent;
exports.waitMs = waitMs;
exports.waitMinutes = waitMinutes;
exports.cleanup = cleanup;
exports.waitForAgentBufferFlush = waitForAgentBufferFlush;
exports.shutdownScout = shutdownScout;
exports.simpleExpressApp = simpleExpressApp;
exports.simpleDynamicSegmentExpressApp = simpleDynamicSegmentExpressApp;
exports.simpleErrorApp = simpleErrorApp;
exports.simpleHTML5BoilerplateApp = simpleHTML5BoilerplateApp;
exports.simpleInstrumentApp = simpleInstrumentApp;
exports.appWithGETSynchronousError = appWithGETSynchronousError;
exports.appWithHTTPProxyMiddleware = appWithHTTPProxyMiddleware;
exports.queryAndRenderRandomNumbers = queryAndRenderRandomNumbers;
exports.appWithRouterGET = appWithRouterGET;
exports.testConfigurationOverlay = testConfigurationOverlay;
exports.buildCoreAgentSocketResponse = buildCoreAgentSocketResponse;
exports.buildTestScoutInstance = buildTestScoutInstance;
exports.startContainer = startContainer;
exports.killContainer = killContainer;
exports.startContainerizedPostgresTest = startContainerizedPostgresTest;
exports.stopContainerizedInstanceTest = stopContainerizedInstanceTest;
exports.stopContainerizedPostgresTest = stopContainerizedPostgresTest;
exports.makeConnectedPGClient = makeConnectedPGClient;
exports.makePGConnectionString = makePGConnectionString;
exports.createClientCollectingServer = createClientCollectingServer;
exports.startContainerizedMySQLTest = startContainerizedMySQLTest;
exports.stopContainerizedMySQLTest = stopContainerizedMySQLTest;
exports.makeConnectedMySQLConnection = makeConnectedMySQLConnection;
exports.makeConnectedMySQL2Connection = makeConnectedMySQL2Connection;
exports.minimal = minimal;
const path = __importStar(require("path"));
const tmp = __importStar(require("tmp-promise"));
const express_1 = __importDefault(require("express"));
const net = __importStar(require("net"));
const randomstring_1 = require("randomstring");
const promise_timeout_1 = require("promise-timeout");
const child_process_1 = require("child_process");
const pg_1 = require("pg");
const mysql_1 = require("mysql");
const mysql2_1 = require("mysql2");
const Constants = __importStar(require("../lib/constants"));
const external_process_1 = __importDefault(require("../lib/agents/external-process"));
const web_1 = __importDefault(require("../lib/agent-downloaders/web"));
const types_1 = require("../lib/types");
const scout_1 = require("../lib/scout");
const config_1 = require("../lib/types/config");
const requests_1 = require("../lib/protocol/v1/requests");
const app_root_dir_1 = require("app-root-dir");
const getPort = require("get-port");
// Wait a little longer for requests that use express
exports.EXPRESS_TEST_TIMEOUT_MS = 3000;
// The timeouts for PG & MSQL assume an instance is *already running*
// for control over the amount of start time alotted see `startTimeoutMs`
exports.PG_TEST_TIMEOUT_MS = 10000;
exports.MYSQL_TEST_TIMEOUT_MS = 10000;
exports.DASHBOARD_SEND_TIMEOUT_MS = 1000 * 60 * 3; // 3 minutes
exports.MEMORY_LEAK_TEST_TIMEOUT_MS = 1000 * 60 * 6; // 6 minutes
const POSTGRES_STARTUP_MESSAGE = "database system is ready to accept connections";
const PROJECT_ROOT = path.join(path.dirname(require.main.filename), "../../");
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
        return new external_process_1.default(procOpts, opts && opts.logFn ? opts.logFn : undefined);
    });
}
// Helper for initializing a bootstrapped agent
function initializeAgent(t, agent, appName, agentKey, appVersion, apiVersion = types_1.APIVersion.V1) {
    t.comment(`initializing agent with appName [${appName}]`);
    return agent.start()
        .then(() => agent.connect())
        .then(() => agent.send(new requests_1.V1Register(appName, agentKey, apiVersion)))
        .then(() => agent);
}
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
function waitMinutes(mins, t) {
    return waitMs(mins * 60 * 1000, t);
}
// Helper function for cleaning up an agent processe and passing/failing a test
function cleanup(t, agent, err) {
    return agent.getProcess()
        .then(process => process.kill())
        .then(() => t.end(err));
}
// Helper that waits for agent buffer to flush
function waitForAgentBufferFlush(t) {
    const interval = Constants.AGENT_BUFFER_TIME_MS;
    if (t) {
        t.comment(`Waiting for agent buffer time (${interval / Constants.MINUTE_MS} minutes)...`);
    }
    return waitMs(interval);
}
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
// Make a simple express application that just returns
// some JSON ({status: "success"}) after waiting a certain amount of milliseconds if provided
function simpleExpressApp(middleware, delayMs = 0) {
    const app = (0, express_1.default)();
    if (middleware) {
        app.use(middleware);
    }
    app.get("/", (req, res) => {
        waitMs(delayMs)
            .then(() => res.send({ status: "success" }));
    });
    return app;
}
// Make an express app with a route with a dynamic segment which returns
// some JSON ({status: "success", segment: <what you sent>}) after waiting a certain amount of milliseconds if provided
function simpleDynamicSegmentExpressApp(middleware, delayMs = 0) {
    const app = (0, express_1.default)();
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
// An express application which errors on the /
function simpleErrorApp(middleware, delayMs = 0) {
    const app = (0, express_1.default)();
    app.use(middleware);
    app.get("/", (req, res) => {
        throw new Error("Expected application error (simpleErrorApp)");
    });
    return app;
}
// An express application which performs a simple template render
function simpleHTML5BoilerplateApp(middleware, templateEngine) {
    const app = (0, express_1.default)();
    app.use(middleware);
    if (templateEngine === "mustache") {
        app.engine("mustache", require("mustache-express")());
    }
    // Expect all the views to be in the same fixtures/files path
    const VIEWS_DIR = path.join((0, app_root_dir_1.get)(), "test/fixtures/files");
    app.set("views", VIEWS_DIR);
    app.set("view engine", templateEngine);
    app.get("/", (req, res) => {
        // if (templateEngine === "pug") {
        //     res.send("<!DOCTYPE html><html><head><title>dynamic</title></head></html><body><h1>Body</h1></body>");
        // } else {
        res.render("html5-boilerplate", { title: "dynamic" });
        // }
    });
    return app;
}
// An express application which performs an instrumentation in GET /
function simpleInstrumentApp(middleware) {
    const app = (0, express_1.default)();
    app.use(middleware);
    app.get("/", (req, res) => {
        if (!req.scout || !req.scout.instance) {
            res.status(500).send({ error: "scout missing on the request" });
            return;
        }
        req.scout.instance.instrument("internal-op", stopSpan => {
            res.send({ status: "success" });
            stopSpan();
        });
    });
    return app;
}
function appWithGETSynchronousError(middleware, expressFnTransform) {
    const app = expressFnTransform(express_1.default)();
    app.use(middleware);
    app.get("/", (req, res) => {
        throw new Error("Expected application error (appWithGETSynchronousError)");
    });
    return app;
}
function appWithHTTPProxyMiddleware(middleware, proxyTarget) {
    const app = (0, express_1.default)();
    app.use(middleware);
    const { createProxyMiddleware } = require("http-proxy-middleware");
    app.get("/", createProxyMiddleware({
        target: proxyTarget,
        changeOrigin: true,
        onError: (err, req, res) => {
            res.status(503).end();
        },
    }));
    return app;
}
// An express application which performs a bunch of trivial SQL queries and renders a template that uses the reuslts
function queryAndRenderRandomNumbers(middleware, templateEngine, dbClient) {
    const app = (0, express_1.default)();
    app.use(middleware);
    if (templateEngine === "mustache") {
        app.engine("mustache", require("mustache-express")());
    }
    // Expect all the views to be in the same fixtures/files path
    const VIEWS_DIR = path.join((0, app_root_dir_1.get)(), "test/fixtures/files");
    app.set("views", VIEWS_DIR);
    app.set("view engine", templateEngine);
    app.get("/", (req, res) => {
        // Generate random numbers
        Promise.all([...Array(10)].map(() => dbClient.query("SELECT RANDOM() * 10 as num"))).then(results => {
            const numbers = results.map(r => r.rows[0].num);
            const numberListItems = numbers.map(n => `<li>${n}</li>`).join("\n");
            res.render("random-numbers", { numbers, numberListItems });
        });
    });
    return app;
}
function appWithRouterGET(middleware, expressFnTransform) {
    const app = expressFnTransform(express_1.default)();
    app.use(middleware);
    // Create first level router & endpoint
    const r1 = express_1.default.Router();
    r1.get("/echo/:name", (req, res) => {
        res.send({ status: "success", name: req.params.name });
    });
    // Create first level router & endpoint
    r1.get("/echo-two/:name", (req, res) => {
        res.send({ status: "success", name: req.params.name });
    });
    // Create level 2 router & endpoint
    const r2 = express_1.default.Router();
    r2.get("/echo/:name", (req, res) => {
        res.send({ status: "success", name: req.params.name });
    });
    // Create app endpoint (shouldn't be hit in most cases, since we want to test router functionality)
    app.get("/", (req, res) => {
        res.status(500).send({ error: "should be hitting the router" });
    });
    // connect r2 -> r1 -> app
    // / -> app
    // /mounted -> r1
    // /mounted/level-2 -> r2 (through r1)
    r1.use("/level-2/", r2);
    app.use("/mounted", r1);
    return app;
}
// Test that a given variable is effectively overlaid in the configuration
function testConfigurationOverlay(t, opts) {
    const { appKey, envValue, expectedValue } = opts;
    const envKey = (0, types_1.convertCamelCaseToEnvVar)(appKey);
    const envValueIsSet = envKey in process.env;
    const defaultConfig = (0, types_1.buildScoutConfiguration)();
    t.assert(defaultConfig, "defaultConfig was generated");
    // Only perform this check if we're not currently overriding the value in ENV *during* this test
    // it won't be the default, because we've set it to be so
    if (appKey in config_1.DEFAULT_SCOUT_CONFIGURATION && !envValueIsSet) {
        t.equals(defaultConfig[appKey], config_1.DEFAULT_SCOUT_CONFIGURATION[appKey], `config [${appKey}] matches default`);
    }
    // Set key at the application level
    const appConfig = {};
    appConfig[appKey] = expectedValue;
    const appOnlyConfig = (0, types_1.buildScoutConfiguration)(appConfig);
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
    const envOverrideConfig = (0, types_1.buildScoutConfiguration)(appConfig);
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
function buildCoreAgentSocketResponse(json) {
    const buf = Buffer.concat([
        Buffer.allocUnsafe(4),
        Buffer.from(json),
    ]);
    buf.writeUInt32BE(json.length, 0);
    return buf;
}
function buildTestScoutInstance(configOverride, options) {
    const cfg = (0, types_1.buildScoutConfiguration)(Object.assign({ allowShutdown: true, monitor: true }, configOverride));
    return new scout_1.Scout(cfg, options);
}
class TestContainerStartOpts {
    constructor(opts) {
        this.dockerBinPath = process.env.DOCKER_BIN_PATH || "/usr/bin/docker";
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
            this.containerName = `test-${this.imageName}-${(0, randomstring_1.generate)(5)}`;
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
    const containerProcess = (0, child_process_1.spawn)(opts.dockerBinPath, args, { detached: true, stdio: "pipe" });
    opts.setExecutedStartCommand(`${opts.dockerBinPath} ${args.join(" ")}`);
    let resolved = false;
    let stdoutListener;
    let stderrListener;
    const makeListener = (type, emitter, expected, resolve, reject) => {
        if (!emitter) {
            return () => reject(new Error(`[${type}] pipe was not Readable`));
        }
        if (expected.times && expected.times <= 0) {
            return () => reject(new Error(`[${type}] invalid waitFor: expected.times <= 0`));
        }
        let times = expected.times ?? 1;
        return (line) => {
            line = line.toString();
            if (!line.includes(expected.phrase)) {
                return;
            }
            // Reduce the amount of times we've seen the expected phrase
            // if we haven't seen it enough times keep listening
            times -= 1;
            if (times > 0) {
                return;
            }
            // Remove the listeners
            if (type === "stdout" && stdoutListener) {
                emitter.removeListener("data", stdoutListener);
            }
            if (type === "stderr" && stderrListener) {
                emitter.removeListener("data", stderrListener);
            }
            // Resolve only once
            if (!resolved) {
                resolve({ containerProcess, opts });
            }
            resolved = true;
        };
    };
    // Wait until process is listening on the given socket port
    const promise = new Promise((resolve, reject) => {
        // If there's a waitFor specified then we're going to have to listen before we return
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
        // Wait for a given function to evaluate to true
        if (opts.waitFor && opts.waitFor.fn) {
            // Check every second for function to evaluate to true
            const startTime = new Date().getTime();
            const interval = setInterval(() => {
                // Ensure opts are still properly formed
                if (!opts || !opts.waitFor || !opts.waitFor.fn || !opts.waitFor.fn.timeoutMs) {
                    clearInterval(interval);
                    reject(new Error("waitFor object became improperly formed"));
                    return;
                }
                // If we've waited too long then clear interval and exit
                const elapsedMs = new Date().getTime() - startTime;
                if (elapsedMs >= opts.waitFor.fn.timeoutMs) {
                    clearInterval(interval);
                    reject(new Error("function never resolved to true before timeout"));
                    return;
                }
                // If we haven't waited too long, check the function
                opts.waitFor.fn.check({ containerProcess, opts })
                    .then(res => {
                    if (!res) {
                        return;
                    }
                    clearInterval(interval);
                    resolve({ containerProcess, opts });
                })
                    .catch(() => undefined);
            }, 1000);
            return;
        }
        containerProcess.on("close", code => {
            if (code !== 0) {
                t.comment("container process closing, piping output to stdout...");
                if (containerProcess.stdout) {
                    containerProcess.stdout.pipe(process.stdout);
                }
                // t.comment(`command: [${opts.executedStartCommand}]`);
                reject(new Error(`Failed to start container (code ${code}), output will be piped to stdout`));
                return;
            }
            resolve({ containerProcess, opts });
        });
    });
    return (0, promise_timeout_1.timeout)(promise, opts.startTimeoutMs)
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
// Kill a running container
function killContainer(t, opts) {
    const args = ["kill", opts.containerName];
    // Spawn the docker container
    t.comment(`attempting to kill [${opts.containerName}]...`);
    const dockerKillProcess = (0, child_process_1.spawn)(opts.dockerBinPath, args, { detached: true, stdio: "ignore" });
    const promise = new Promise((resolve, reject) => {
        dockerKillProcess.on("close", code => {
            resolve(code);
        });
    });
    return (0, promise_timeout_1.timeout)(promise, opts.killTimeoutMs);
}
const POSTGRES_IMAGE_NAME = "postgres";
const POSTGRES_IMAGE_TAG = "12.2-alpine";
const POSTGRES_CONTAINER_DEFAULT_ENV = {
    POSTGRES_PASSWORD: "postgres",
};
// Utility function to start a postgres instance
function startContainerizedPostgresTest(test, cb, containerEnv, tagName) {
    tagName = tagName || POSTGRES_IMAGE_TAG;
    const envBinding = Object.assign({}, POSTGRES_CONTAINER_DEFAULT_ENV, containerEnv);
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
                waitFor: { stdout: { phrase: POSTGRES_STARTUP_MESSAGE } },
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
function stopContainerizedInstanceTest(test, provider, name) {
    test(`Stopping containerized ${name} instance...`, (t) => {
        const containerAndOpts = provider();
        if (!containerAndOpts) {
            throw new Error("no container w/ opts object provided, can't stop container");
        }
        const opts = containerAndOpts.opts;
        killContainer(t, opts)
            .then(code => t.pass(`successfully stopped container [${opts.containerName}], with code [${code}]`))
            .then(() => t.end())
            .catch(err => t.end(err));
    });
}
// Utility function to stop a postgres instance
function stopContainerizedPostgresTest(test, provider) {
    stopContainerizedInstanceTest(test, provider, "postgres");
}
function makeConnectedPGClient(provider) {
    const cao = provider();
    if (!cao) {
        return Promise.reject(new Error("no CAO in provider"));
    }
    const port = cao.opts.portBinding[5432];
    const opts = {
        user: "postgres",
        host: "localhost",
        database: "postgres",
        password: "postgres",
        port,
    };
    const client = new pg_1.Client(opts);
    return client.connect()
        .then(() => client);
}
// Utility function to create a connection string
function makePGConnectionString(provider) {
    const cao = provider();
    if (!cao) {
        return Promise.reject(new Error("no CAO in provider"));
    }
    const port = cao.opts.portBinding[5432];
    return Promise.resolve(`postgres://postgres:postgres@localhost:${port}/postgres`);
}
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
const MYSQL_IMAGE_NAME = "mysql";
const MYSQL_IMAGE_TAG = "5.7.29";
// mysql takes this long to start up, can't wait for output because
// even when it says it's ready to accept connections it will drop them.
// this startup time was arrived at by trial and error and may need to be adjusted.
const MYSQL_CONTAINER_STARTUP_TIME_MS = process.env.CI ? 60000 : 20000;
const MYSQL_STARTUP_MESSAGE = "MySQL init process done. Ready for startup.";
const MYSQL_CONTAINER_DEFAULT_ENV = {
    MYSQL_ROOT_PASSWORD: "mysql",
};
// Utility function to start a postgres instance
function startContainerizedMySQLTest(test, cb, opts) {
    const tagName = opts && opts.tagName ? opts.tagName : MYSQL_IMAGE_TAG;
    const containerEnv = opts && opts.containerEnv ? opts.containerEnv : {};
    const envBinding = Object.assign({}, MYSQL_CONTAINER_DEFAULT_ENV, containerEnv);
    const isMysql2 = opts && opts.mysqlPackageName && opts.mysqlPackageName === "mysql2";
    // Use the mysql2 connection function if necessary
    let connFn = makeConnectedMySQLConnection;
    if (isMysql2) {
        connFn = makeConnectedMySQL2Connection;
    }
    // We'll need to set the timeout of the test to startup time + 1s to prevent test timeout
    test("Starting mysql instance", { timeout: MYSQL_CONTAINER_STARTUP_TIME_MS + 1000 }, (t) => {
        let port;
        let containerAndOpts;
        // Get a random port for mysql to use
        getPort()
            .then(p => port = p)
            .then(() => {
            const portBinding = { 3306: port };
            // Attempt to start the container
            return startContainer(t, {
                imageName: MYSQL_IMAGE_NAME,
                tagName,
                portBinding,
                envBinding,
                // since we don't want the test to actually take MYSQL_CONTAINER_STARTUP_TIME_MS time,
                // we use the waitfor.fn feature to attempt to connect repeatedly until it lets us
                // wait time is still constrained by timeoutMs
                waitFor: {
                    fn: {
                        timeoutMs: MYSQL_CONTAINER_STARTUP_TIME_MS,
                        // check for the container to have started if we can make a connection
                        check: (cao) => {
                            return connFn(() => cao)
                                .then(conn => {
                                // if we make a connection, immediately close it and return true
                                return new Promise((resolve, reject) => {
                                    conn.end((err) => {
                                        if (err) {
                                            reject(err);
                                            return;
                                        }
                                        resolve(true);
                                    });
                                });
                            });
                        },
                    },
                },
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
function stopContainerizedMySQLTest(test, provider) {
    stopContainerizedInstanceTest(test, provider, "msyql");
}
// Helper for creating a connected connection for MySQL
function makeConnectedMySQLConnection(provider) {
    const cao = provider();
    if (!cao) {
        return Promise.reject(new Error("no CAO in provider"));
    }
    const port = cao.opts.portBinding[3306];
    const conn = (0, mysql_1.createConnection)({
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
// Helper for creating a connected connection for MySQL
function makeConnectedMySQL2Connection(provider) {
    const cao = provider();
    if (!cao) {
        return Promise.reject(new Error("no CAO in provider"));
    }
    const config = {
        user: "root",
        password: "mysql",
        host: "localhost",
        port: cao.opts.portBinding[3306],
        // Connect timeout to enable using this as a check in waitFor
        connectTimeout: 9999,
    };
    const conn = (0, mysql2_1.createConnection)(config);
    // We have to ignore errors that are emitted by the mysl2 Connection object
    // because they will crash the node runtime otherwise.
    // Unsucessful creation attempts will hang until they crash
    conn.on("error", (err) => undefined);
    try {
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
    catch {
        return Promise.reject(new Error("connect failed"));
    }
}
// Create a minimal object for easy printing (or util.inspecting) of scout requests/spans
function minimal(reqOrSpan) {
    if (reqOrSpan instanceof scout_1.ScoutRequest) {
        return {
            id: reqOrSpan.id,
            tags: reqOrSpan.getTags(),
            start: reqOrSpan.getTimestamp(),
            end: reqOrSpan.getEndTime(),
            childSpans: reqOrSpan.getChildSpansSync().map(minimal),
        };
    }
    if (reqOrSpan instanceof scout_1.ScoutSpan) {
        return {
            id: reqOrSpan.id,
            operation: reqOrSpan.operation,
            tags: reqOrSpan.getTags(),
            start: reqOrSpan.getTimestamp(),
            end: reqOrSpan.getEndTime(),
            childSpans: reqOrSpan.getChildSpansSync().map(minimal),
        };
    }
    throw new Error("Invalid object, neither ScoutReqOrRequest nor ScoutSpan");
}
