"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const os_1 = require("os");
const process_1 = require("process");
const os = require("os");
const path = require("path");
const app_root_path_1 = require("app-root-path");
const enum_1 = require("./enum");
const util_1 = require("./util");
const enum_2 = require("./enum");
const detect_libc_1 = require("detect-libc");
const Constants = require("../constants");
const errors_1 = require("../errors");
class ApplicationMetadata {
    constructor(config, opts) {
        const pkgJson = require("root-require")("package.json") || { dependencies: [], version: "unknown" };
        const depsWithVersions = Object.entries(pkgJson.dependencies);
        const libraries = depsWithVersions.sort((a, b) => a[0].localeCompare(b[0]));
        this.language = "nodejs";
        this.languageVersion = process_1.version;
        this.serverTime = new Date().toISOString();
        this.framework = config.framework || "";
        this.frameworkVersion = config.frameworkVersion || "";
        this.environment = "";
        this.appServer = config.appServer || "";
        this.hostname = config.hostname || "";
        this.databaseEngine = "";
        this.databaseAdapter = "";
        this.applicationName = config.name || "";
        this.libraries = libraries;
        this.paas = "";
        this.applicationRoot = config.applicationRoot || "";
        this.scmSubdirectory = config.scmSubdirectory || "";
        this.gitSHA = config.revisionSHA || "";
        // Handle overrides
        if (opts) {
            if (opts.version) {
                this.version = opts.version;
            }
            if (opts.language) {
                this.language = opts.language;
            }
            if (opts.languageVersion) {
                this.languageVersion = opts.languageVersion;
            }
            if (opts.serverTime) {
                this.serverTime = opts.serverTime || new Date().toISOString();
            }
            if (opts.framework) {
                this.framework = opts.framework;
            }
            if (opts.frameworkVersion) {
                this.frameworkVersion = opts.frameworkVersion;
            }
            if (opts.environment) {
                this.environment = opts.environment;
            }
            if (opts.appServer) {
                this.appServer = opts.appServer;
            }
            if (opts.hostname) {
                this.hostname = opts.hostname;
            }
            if (opts.databaseEngine) {
                this.databaseEngine = opts.databaseEngine;
            }
            if (opts.databaseAdapter) {
                this.databaseAdapter = opts.databaseAdapter;
            }
            if (opts.applicationName) {
                this.applicationName = opts.applicationName;
            }
            if (opts.libraries) {
                this.libraries = opts.libraries || [];
            }
            if (opts.paas) {
                this.paas = opts.paas;
            }
            if (opts.gitSHA) {
                this.gitSHA = opts.gitSHA;
            }
            if (opts.applicationRoot) {
                this.applicationRoot = opts.applicationRoot;
            }
            if (opts.scmSubdirectory) {
                this.scmSubdirectory = opts.scmSubdirectory;
            }
        }
    }
    /**
     * Generate a version of the ApplicationMetadata that is formatted as core-agent expects it to be
     *
     * @returns {Object} ApplicationMetadata with keys/values as core-agent expects
     */
    serialize() {
        return {
            language: this.language,
            language_version: this.languageVersion,
            server_time: this.serverTime,
            framework: this.framework,
            framework_version: this.frameworkVersion,
            environment: this.environment,
            app_server: this.appServer,
            hostname: this.hostname,
            database_engine: this.databaseEngine,
            database_adapter: this.databaseAdapter,
            application_name: this.applicationName,
            scm_subdirectory: this.scmSubdirectory,
            application_root: this.applicationRoot,
            version: this.languageVersion,
            libraries: this.libraries,
            paas: this.paas,
            git_sha: this.gitSHA,
        };
    }
}
exports.ApplicationMetadata = ApplicationMetadata;
exports.DEFAULT_SCOUT_CONFIGURATION = {
    key: "",
    name: "",
    appServer: "",
    coreAgentDownload: true,
    coreAgentLaunch: true,
    coreAgentLogLevel: enum_1.LogLevel.Info,
    coreAgentPermissions: 700,
    coreAgentVersion: "v1.2.7",
    disabledInstruments: [],
    downloadUrl: "https://s3-us-west-1.amazonaws.com/scout-public-downloads/apm_core_agent/release",
    framework: "",
    frameworkVersion: "",
    hostname: null,
    monitor: false,
    revisionSHA: process.env.HEROKU_SLUG_COMMIT || "",
    scmSubdirectory: "",
    uriReporting: enum_1.URIReportingLevel.FilteredParams,
    applicationRoot: app_root_path_1.path,
};
/**
 * DefaultConfigSource returns only default values
 *
 * @class
 */
class DefaultConfigSource {
    getName() { return enum_1.ConfigSourceName.Default; }
    getConfigValue(prop) {
        return exports.DEFAULT_SCOUT_CONFIGURATION[prop];
    }
    setConfigValue() {
        throw new errors_1.NotSupported("new configuration values cannot be set on the default source");
    }
}
// List of transformations to use on certain ENV variables to create appropriate JS objects
const ENV_TRANSFORMS = {
    SCOUT_CORE_AGENT_LOG_LEVEL: enum_1.parseLogLevel,
    SCOUT_LOG_LEVEL: enum_1.parseLogLevel,
    SCOUT_CORE_AGENT_DOWNLOAD: v => v.toLowerCase() === "true",
    SCOUT_CORE_AGENT_LAUNCH: v => v.toLowerCase() === "true",
    SCOUT_CORE_AGENT_PERMISSIONS: v => parseInt(v, 10),
    SCOUT_DISABLED_INSTRUMENTS: v => v.split(","),
    SCOUT_IGNORE: v => v.split(","),
    SCOUT_MONITOR: v => v.toLowerCase() === "true",
};
/**
 * EnvConfigSource returns the values set from the environment
 *
 * @class
 */
class EnvConfigSource {
    constructor(env) {
        this.env = env;
    }
    getName() { return enum_1.ConfigSourceName.Env; }
    getConfigValue(prop) {
        if (typeof prop === "symbol") {
            return this.env[prop];
        }
        const envVar = util_1.convertCamelCaseToEnvVar(prop);
        let val = this.env[envVar];
        if (typeof val !== "undefined" && envVar in ENV_TRANSFORMS) {
            val = ENV_TRANSFORMS[envVar](val);
        }
        return val;
    }
    setConfigValue() {
        throw new errors_1.NotSupported("new configuration values cannot be set on the env source");
    }
}
/**
 * DerivedConfigSource returns values that are built from other values
 *
 * @class
 */
class DerivedConfigSource {
    constructor(logFn) {
        this.logFn = logFn;
    }
    getName() { return enum_1.ConfigSourceName.Derived; }
    getConfigValue(prop, p) {
        let coreAgentTriple;
        // Beware, the access to non-derived values here are somewhat recursive in behavior --
        // ex. when `coreAgentDir` is fetched to build `socketPath`, the proxy is utilized the top level down,
        // working through the sources again
        switch (prop) {
            case "socketPath":
                const coreAgentDir = p.get({}, "coreAgentDir");
                const coreAgentFullName = p.get({}, "coreAgentFullName");
                return `${coreAgentDir}/${coreAgentFullName}/${Constants.DEFAULT_SOCKET_FILE_NAME}`;
            case "coreAgentFullName":
                coreAgentTriple = p.get({}, "coreAgentTriple");
                if (!isValidTriple(coreAgentTriple) && this.logFn) {
                    this.logFn(`Invalid value for core_agent_triple: [${coreAgentTriple}]`, enum_1.LogLevel.Warn);
                }
                const coreAgentVersion = p.get({}, "coreAgentVersion");
                return `${Constants.DEFAULT_CORE_AGENT_NAME}-${coreAgentVersion}-${coreAgentTriple}`;
            case "coreAgentTriple":
                return generateTriple();
            case "coreAgentDir":
                coreAgentTriple = p.get({}, "coreAgentTriple");
                const version = p.get({}, "coreAgentVersion");
                return path.join(os.tmpdir(), "scout_apm_core");
            default:
                return undefined;
        }
    }
    setConfigValue() {
        throw new errors_1.NotSupported("new configuration values cannot be set on the derived source");
    }
}
// Detect the machine architecture
function detectArch() {
    switch (os_1.arch()) {
        case "x64": return enum_1.Architecture.X86_64;
        case "x32": return enum_1.Architecture.I686;
        default:
            return enum_1.Architecture.Unknown;
    }
}
// Retrieve the machine platform
function detectPlatform() {
    switch (os_1.platform()) {
        case "linux": return detect_libc_1.isNonGlibcLinux ? enum_1.Platform.LinuxMusl : enum_1.Platform.LinuxGNU;
        case "darwin": return enum_1.Platform.Darwin;
        default:
            return enum_1.Platform.Unknown;
    }
}
function detectPlatformTriple() {
    const triple = generateTriple();
    if (!(Object.values(enum_2.PlatformTriple).includes(triple))) {
        throw new Error("Invalid platform triple");
    }
    return triple;
}
exports.detectPlatformTriple = detectPlatformTriple;
// Generate the architecture/platform triple
function generateTriple() {
    return `${detectArch()}-${detectPlatform()}`;
}
exports.generateTriple = generateTriple;
// Check if a triple is valid
function isValidTriple(triple) {
    if (!triple) {
        return false;
    }
    const [arch, ...platformPieces] = triple.split("-");
    const platform = platformPieces.join("-");
    return Object.values(enum_1.Architecture).includes(arch)
        && Object.values(enum_1.Platform).includes(platform);
}
/**
 * NodeConfigSource returns values that are build/managed by the node process
 *
 * @class
 */
class NodeConfigSource {
    constructor(config) {
        this.config = config;
    }
    getName() { return enum_1.ConfigSourceName.Node; }
    getConfigValue(prop) {
        return this.config[prop];
    }
    setConfigValue(prop, value) {
        this.config[prop] = value;
    }
}
/**
 * ScoutConfiguration is a proxy that encapsulates a *raw* configuration object
 * It takes sources but it's job is to
 */
class ScoutConfigurationProxy {
    constructor(initialNodeConfig, opts) {
        this.nodeConfigSource = new NodeConfigSource(initialNodeConfig || {});
        this.sources = [
            new EnvConfigSource(opts && opts.env ? opts.env : process.env),
            this.nodeConfigSource,
            new DerivedConfigSource(opts && opts.logFn ? opts.logFn : undefined),
            new DefaultConfigSource(),
        ];
    }
    get(obj, prop) {
        // Attempt to find a non-undefined value in any of the sources
        for (const s of this.sources) {
            const val = s.getConfigValue(prop, this);
            if (typeof val !== "undefined") {
                return val;
            }
        }
        return undefined;
    }
    set(obj, prop, value) {
        // Set *only* sets values on the NodeConfigSource being used.
        this.nodeConfigSource.setConfigValue(prop, value);
        return true;
    }
}
exports.ScoutConfigurationProxy = ScoutConfigurationProxy;
/**
 * Build a ScoutConfiguration object, which is actually a Proxy which checks other sources,
 * a thin wrapper for the ScoutConfiguration to ensure values are pulled from appropriate sources
 */
function buildScoutConfiguration(initialNodeConfig, opts) {
    return new Proxy({}, new ScoutConfigurationProxy(initialNodeConfig, opts));
}
exports.buildScoutConfiguration = buildScoutConfiguration;
/**
 * Build download options to be used with an AgentDownloader,
 * based on the options provided to Scout at the top level.
 *
 * @returns {AgentDownloadOptions}
 */
function buildDownloadOptions(config) {
    return {
        coreAgentFullName: config.coreAgentFullName,
        coreAgentDir: config.coreAgentDir,
        disallowDownload: !config.coreAgentDownload,
        downloadUrl: config.downloadUrl,
    };
}
exports.buildDownloadOptions = buildDownloadOptions;
/**
 * Build download options to be used with an AgentDownloader,
 * based on the options provided to Scout at the top level.
 *
 * @returns {ProcessOptions}
 */
function buildProcessOptions(config) {
    return {
        disallowLaunch: !config.coreAgentLaunch,
        logFilePath: config.logFilePath,
        logLevel: config.logLevel || config.coreAgentLogLevel,
    };
}
exports.buildProcessOptions = buildProcessOptions;
