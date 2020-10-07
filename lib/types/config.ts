import { hostname, arch as getSystemArch, platform as getSystemPlatform } from "os";
import { version as processVersion } from "process";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { path as appRootPath } from "app-root-path";
import * as semver from "semver";

import {
    Architecture,
    ConfigSourceName,
    LogLevel,
    Platform,
    URIReportingLevel,
    parseLogLevel,
} from "./enum";
import { AgentDownloadOptions } from "./downloader";
import { LogFn, convertCamelCaseToEnvVar } from "./util";
import { ProcessOptions } from "./agent";
import { PlatformTriple } from "./enum";

import { isNonGlibcLinux } from "detect-libc";

import * as Constants from "../constants";
import { NotSupported } from "../errors";

import { snakeCase } from "snake-case";

interface MapLike {
    get(s: string): any;
}

const CONFIG_MODULE_INSIDE_NODE_MODULES = [
    "node_modules",
    "@scout_apm",
    "scout-apm",
    "dist",
    "lib",
    "types",
    "config.js",
].join(path.sep);

export class ApplicationMetadata {
    public readonly version: string;
    public readonly language: string;
    public readonly languageVersion: string;
    public readonly serverTime: string;
    public readonly framework: string;
    public readonly frameworkVersion: string;
    public readonly environment: string;
    public readonly appServer: string;
    public readonly hostname: string;
    public readonly databaseEngine: string;
    public readonly databaseAdapter: string;
    public readonly applicationName: string;
    public readonly libraries: Array<[string, any]>;
    public readonly paas: string;
    public readonly gitSHA: string;
    public readonly applicationRoot: string;
    public readonly scmSubdirectory: string;

    constructor(config: Partial<ScoutConfiguration>, opts?: Partial<ApplicationMetadata>) {
        this.language = "nodejs";
        this.languageVersion = processVersion;
        this.serverTime = new Date().toISOString();
        this.framework = config.framework || "";
        this.frameworkVersion = config.frameworkVersion || "";
        this.environment = "";
        this.appServer = config.appServer || "";
        this.hostname = config.hostname || "";
        this.databaseEngine = "";
        this.databaseAdapter = "";
        this.applicationName = config.name || "";
        this.libraries = [];
        this.paas = "";
        this.applicationRoot = config.applicationRoot || "";
        this.scmSubdirectory = config.scmSubdirectory || "";
        this.gitSHA = config.revisionSHA || "";

        // Handle overrides
        if (opts) {
            if (opts.version) { this.version = opts.version; }
            if (opts.language) { this.language = opts.language; }
            if (opts.languageVersion) { this.languageVersion = opts.languageVersion; }
            if (opts.serverTime) { this.serverTime = opts.serverTime || new Date().toISOString(); }
            if (opts.framework) { this.framework = opts.framework; }
            if (opts.frameworkVersion) { this.frameworkVersion = opts.frameworkVersion; }
            if (opts.environment) { this.environment = opts.environment; }
            if (opts.appServer) { this.appServer = opts.appServer; }
            if (opts.hostname) { this.hostname = opts.hostname; }
            if (opts.databaseEngine) { this.databaseEngine = opts.databaseEngine; }
            if (opts.databaseAdapter) { this.databaseAdapter = opts.databaseAdapter; }
            if (opts.applicationName) { this.applicationName = opts.applicationName; }
            if (opts.libraries) { this.libraries = opts.libraries || []; }
            if (opts.paas) { this.paas = opts.paas; }
            if (opts.gitSHA) { this.gitSHA = opts.gitSHA; }
            if (opts.applicationRoot) { this.applicationRoot = opts.applicationRoot; }
            if (opts.scmSubdirectory) { this.scmSubdirectory = opts.scmSubdirectory; }
        }

        // Attempt to derive the libraries used by the project
        if (!this.libraries || this.libraries.length === 0) {
            let pkgJsonPath;

            // If applicationRoot was provided then use it
            const applicationRootDirExists = this.applicationRoot &&
                fs.existsSync(this.applicationRoot) &&
                fs.lstatSync(this.applicationRoot).isDirectory();
            if (applicationRootDirExists) {
                pkgJsonPath = path.join(this.applicationRoot, "package.json");

                // If a package json exists at the applicationRoot folder, attempt to load it
                if (fs.existsSync(pkgJsonPath)) {
                    try {
                        const pkgJson = require(pkgJsonPath) || {dependencies: [], version: "unknown"};
                        const depsWithVersions = Object.entries(pkgJson.dependencies);
                        this.libraries = depsWithVersions.sort((a, b) => a[0].localeCompare(b[0]));
                    } catch {
                        // If the require has failed or package.json is malformed
                        // tslint:disable-next-line:no-console
                        console.log(`package.json at [${pkgJsonPath}] is malformed/couldn't be read`);
                    }
                    return;
                }
            }

            // If the applicationRoot was *not* provided, then attempt to get to package json
            // from the installed @scout_apm/scout-apm config.js file

            // Starting at the path to this module, we must work backwards to get the including project's package.json
            // expecting a path like [path/to/project/node_modules/@scout_apm/scout-apm/....]
            let projectRootDir = __filename;

            // If we see the path pattern we expect (@scout_apm/scout-apm nested in a node module)
            // then get the project's libraries
            if (projectRootDir.includes(CONFIG_MODULE_INSIDE_NODE_MODULES)) {
                // Go up seven directories to make it from the types folder to the containing project root
                projectRootDir = [...Array(7)].reduce((acc) => path.dirname(acc), projectRootDir);

                const pkgJsonPath = path.join(projectRootDir, "package.json");

                // If a package json exists at the root, attempt ot load it
                if (fs.existsSync(pkgJsonPath)) {
                    try {
                        const pkgJson = require(pkgJsonPath) || {dependencies: [], version: "unknown"};
                        const depsWithVersions = Object.entries(pkgJson.dependencies);
                        this.libraries = depsWithVersions.sort((a, b) => a[0].localeCompare(b[0]));
                    } catch {
                        // If the require has failed or package.json is malformed
                        // tslint:disable-next-line:no-console
                        console.log(`package.json at [${pkgJsonPath}] is malformed/couldn't be read`);
                    }
                    return;
                }
            }

        }
    }

    /**
     * Generate a version of the ApplicationMetadata that is formatted as core-agent expects it to be
     *
     * @returns {Object} ApplicationMetadata with keys/values as core-agent expects
     */
    public serialize(): object {
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

export interface ScoutConfiguration {
    // Application finger printing / auth
    name: string;
    key: string;
    revisionSHA: string;
    appServer: string;
    applicationRoot: string;
    scmSubdirectory: string;

    // Operation
    logLevel: LogLevel;
    socketPath: string;
    logFilePath: "stdout" | string;
    httpProxy: string;
    allowShutdown: boolean;
    monitor: boolean;

    // Framework
    framework: string;
    frameworkVersion: string;

    // Agent
    apiVersion: string;
    downloadUrl: string;

    coreAgentDownload: boolean;
    coreAgentLaunch: boolean;
    coreAgentDir: string;
    coreAgentLogLevel: LogLevel;
    coreAgentPermissions: number;
    coreAgentVersion: string;

    // Machine information
    hostname: string | null;

    // Trace controls
    ignore: string[]; // ignored route prefixes
    collectRemoteIP: boolean;
    uriReporting: URIReportingLevel;

    // Misc
    disabledInstruments: string[];

    // Derived
    coreAgentTriple: string;
    coreAgentFullName: string;
}

export const DEFAULT_SCOUT_CONFIGURATION: Partial<ScoutConfiguration> = {
    key: "",
    name: "",
    appServer: "",

    coreAgentDownload: true,
    coreAgentLaunch: true,
    coreAgentLogLevel: LogLevel.Info,
    coreAgentPermissions: 700,
    coreAgentVersion: "v1.3.0", // can be exact tag name, or 'latest'

    disabledInstruments: [],
    downloadUrl: "https://s3-us-west-1.amazonaws.com/scout-public-downloads/apm_core_agent/release",

    framework: "",
    frameworkVersion: "",

    hostname: null,

    monitor: false,

    revisionSHA: process.env.HEROKU_SLUG_COMMIT || "",
    scmSubdirectory: "",
    uriReporting: URIReportingLevel.FilteredParams,

    // Application root should be the folder *containing* the node project
    // https://github.com/scoutapp/scout_apm_node/issues/169
    applicationRoot: path.dirname(appRootPath),
};

interface ConfigSource {
    // Get the name of the config source
    getName(): ConfigSourceName;

    // Get a configuration value out of the source
    getConfigValue(
        prop: string,
        cfg: ScoutConfigurationProxy,
    ): any;

    // Set a configuration value on the source.
    // note that most sources will *not* support this.
    setConfigValue(
        prop: string,
        value: any,
    ): void;
}

/**
 * DefaultConfigSource returns only default values
 *
 * @class
 */
class DefaultConfigSource implements ConfigSource {
    public getName() { return ConfigSourceName.Default; }

    public getConfigValue(prop: string): any {
        return DEFAULT_SCOUT_CONFIGURATION[prop];
    }

    public setConfigValue() {
        throw new NotSupported("new configuration values cannot be set on the default source");
    }
}

// List of transformations to use on certain ENV variables to create appropriate JS objects
const ENV_TRANSFORMS = {
    SCOUT_CORE_AGENT_LOG_LEVEL: parseLogLevel,
    SCOUT_LOG_LEVEL: parseLogLevel,
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
class EnvConfigSource implements ConfigSource {
    public readonly env: any;

    constructor(env: any) {
        this.env = env;
    }

    public getName() { return ConfigSourceName.Env; }

    public getConfigValue(prop: string): any {
        if (typeof prop === "symbol") {
            return this.env[prop];
        }

        const envVar = convertCamelCaseToEnvVar(prop);
        let val = this.env[envVar];

        if (typeof val !== "undefined" && envVar in ENV_TRANSFORMS) {
            val = ENV_TRANSFORMS[envVar](val);
        }

        return val;
    }

    public setConfigValue() {
        throw new NotSupported("new configuration values cannot be set on the env source");
    }
}

/**
 * DerivedConfigSource returns values that are built from other values
 *
 * @class
 */
class DerivedConfigSource implements ConfigSource {
    private readonly logFn?: LogFn;

    constructor(logFn?: LogFn) {
        this.logFn = logFn;
    }

    public getName() { return ConfigSourceName.Derived; }

    public getConfigValue(prop: string, p: ScoutConfigurationProxy): any {
        let coreAgentTriple;
        // Beware, the access to non-derived values here are somewhat recursive in behavior --
        // ex. when `coreAgentDir` is fetched to build `socketPath`, the proxy is utilized the top level down,
        // working through the sources again
        switch (prop) {
            case "socketPath":
                const agentVersion = p.get({}, "coreAgentVersion");

                // If we are using core agent newer than CORE_AGENT_TCP_SOCKET_MIN_VERSION,
                // default to a TCP connection
                if (agentVersion && semver.lt(agentVersion.raw, Constants.CORE_AGENT_TCP_SOCKET_MIN_VERSION)) {
                    return `tcp://${Constants.CORE_AGENT_TCP_DEFAULT_HOST}:${Constants.CORE_AGENT_TCP_DEFAULT_PORT}`;
                }

                const coreAgentDir = p.get({}, "coreAgentDir");
                const coreAgentFullName = p.get({}, "coreAgentFullName");
                return `${coreAgentDir}/${coreAgentFullName}/${Constants.DEFAULT_SOCKET_FILE_NAME}`;
            case "coreAgentFullName":
                coreAgentTriple = p.get({}, "coreAgentTriple");
                if (!isValidTriple(coreAgentTriple) && this.logFn) {
                    this.logFn(`Invalid value for core_agent_triple: [${coreAgentTriple}]`, LogLevel.Warn);
                }

                const coreAgentVersion = p.get({}, "coreAgentVersion");
                return `${Constants.DEFAULT_CORE_AGENT_NAME}-${coreAgentVersion}-${coreAgentTriple}`;
            case "coreAgentTriple":
                return generateTriple();
            case "coreAgentDir":
                coreAgentTriple = p.get({}, "coreAgentTriple");
                const version = p.get({}, "coreAgentVersion");
                return path.join(
                    os.tmpdir(),
                    "scout_apm_core",
                );
            default:
                return undefined;
        }
    }

    public setConfigValue() {
        throw new NotSupported("new configuration values cannot be set on the derived source");
    }
}

// Detect the machine architecture
function detectArch(): Architecture {
    switch (getSystemArch()) {
        case "x64": return Architecture.X86_64;
        case "x32": return Architecture.I686;
        default:
            return Architecture.Unknown;
    }
}

// Retrieve the machine platform
function detectPlatform(): Platform {
    // Default to Musl Linux, even on glibc-enabled distros
    // https://github.com/scoutapp/scout_apm_node/issues/174
    switch (getSystemPlatform()) {
        case "linux": return Platform.LinuxMusl;
        case "darwin": return Platform.Darwin;
        default:
            return Platform.Unknown;
    }
}

export function detectPlatformTriple(): Promise<PlatformTriple> {
    const triple = generateTriple();
    if (!(Object.values(PlatformTriple).includes(triple as PlatformTriple))) {
        return Promise.reject(new Error("Invalid platform triple"));
    }

    return Promise.resolve(triple as PlatformTriple);
}

// Generate the architecture/platform triple
export function generateTriple() {
    return `${detectArch()}-${detectPlatform()}`;
}

// Check if a triple is valid
function isValidTriple(triple?: string | undefined): boolean {
    if (!triple) { return false; }

    const [arch, ...platformPieces] = triple.split("-");
    const platform: string = platformPieces.join("-");

    return Object.values(Architecture).includes(arch as Architecture)
        && Object.values(Platform).includes(platform as Platform);
}

/**
 * NodeConfigSource returns values that are build/managed by the node process
 *
 * @class
 */
class NodeConfigSource implements ConfigSource {
    private config: Partial<ScoutConfiguration>;

    constructor(config: Partial<ScoutConfiguration>) {
        this.config = config;
    }

    public getName() { return ConfigSourceName.Node; }

    public getConfigValue(prop: string): any {
        return this.config[prop];
    }

    public setConfigValue(prop: string, value: any) {
        this.config[prop] = value;
    }
}

interface ScoutConfigurationProxyOptions {
    env?: any;
    logFn?: LogFn;
}

/**
 * ScoutConfiguration is a proxy that encapsulates a *raw* configuration object
 * It takes sources but it's job is to
 */
export class ScoutConfigurationProxy {
    private readonly nodeConfigSource: NodeConfigSource;
    private readonly sources: ConfigSource[];

    constructor(
        initialNodeConfig?: Partial<ScoutConfiguration>,
        opts?: ScoutConfigurationProxyOptions,
    ) {
        this.nodeConfigSource = new NodeConfigSource(initialNodeConfig || {});

        this.sources = [
            new EnvConfigSource(opts && opts.env ? opts.env : process.env),
            this.nodeConfigSource,
            new DerivedConfigSource(opts && opts.logFn ? opts.logFn : undefined),
            new DefaultConfigSource(),
        ];
    }

    public get(obj: any, prop: string) {
        // Attempt to find a non-undefined value in any of the sources
        for (const s of this.sources) {
            const val = s.getConfigValue(prop, this);
            if (typeof val !== "undefined") {
                return val;
            }
        }

        return undefined;
    }

    public set(obj: any, prop: string, value: any) {
        // Set *only* sets values on the NodeConfigSource being used.
        this.nodeConfigSource.setConfigValue(prop, value);
        return true;
    }
}

/**
 * Build a ScoutConfiguration object, which is actually a Proxy which checks other sources,
 * a thin wrapper for the ScoutConfiguration to ensure values are pulled from appropriate sources
 */
export function buildScoutConfiguration(
    initialNodeConfig?: Partial<ScoutConfiguration>,
    opts?: ScoutConfigurationProxyOptions,
): Partial<ScoutConfiguration> {
    return new Proxy({} as ScoutConfiguration, new ScoutConfigurationProxy(initialNodeConfig, opts));
}

/**
 * Build download options to be used with an AgentDownloader,
 * based on the options provided to Scout at the top level.
 *
 * @returns {AgentDownloadOptions}
 */
export function buildDownloadOptions(config: Partial<ScoutConfiguration>): Partial<AgentDownloadOptions> {
    return {
        coreAgentFullName: config.coreAgentFullName,
        coreAgentDir: config.coreAgentDir,
        disallowDownload: !config.coreAgentDownload,
        downloadUrl: config.downloadUrl,
    };
}

/**
 * Build download options to be used with an AgentDownloader,
 * based on the options provided to Scout at the top level.
 *
 * @returns {ProcessOptions}
 */
export function buildProcessOptions(config: Partial<ScoutConfiguration>): Partial<ProcessOptions> {
    return {
        disallowLaunch: !config.coreAgentLaunch,
        logFilePath: config.logFilePath,
        logLevel: config.logLevel || config.coreAgentLogLevel,
    };
}
