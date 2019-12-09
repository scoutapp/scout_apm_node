import { hostname } from "os";

import { LogLevel, URIReportingLevel, parseLogLevel } from "./enum";
import { AgentDownloadOptions } from "./downloader";

interface MapLike {
    get(s: string): any;
}

export class ScoutConfiguration {
    /**
     * Build a Scout configuration from environment variables available
     *
     * @param {object} env - The environment
     * @returns {Partial<ScoutConfiguration>} The generated scout configuration
     */
    public static fromEnv(env: Record<string, string | undefined> = process.env): Partial<ScoutConfiguration> {
        const result: any = {};
        if (env.SCOUT_APP) { result.applicationName = env.SCOUT_APP; }
        if (env.SCOUT_KEY) { result.key = env.SCOUT_KEY; }
        if (env.SCOUT_REVISION_SHA) { result.revisionSHA = env.SCOUT_REVISION_SHA; }

        const logLevel = env.SCOUT_LOG_LEVEL;
        if (typeof logLevel !== "undefined") {
            result.logLevel = parseLogLevel(logLevel);
        }

        if (env.SCOUT_HTTP_PROXY) { result.httpProxy = env.SCOUT_HTTP_PROXY; }
        if (env.SCOUT_HOSTNAME) { result.hostname = env.SCOUT_HOSTNAME; }

        if (env.SCOUT_IGNORED_ROUTE_PREFIXES) {
            result.ignoredRoutePrefixes = env.SCOUT_IGNORED_ROUTE_PREFIXES.split(",").filter(v => v);
        }

        if (env.SCOUT_COLLECT_REMOTE_IP) {
            result.collectRemoteIP = env.SCOUT_COLLECT_REMOTE_IP.toLowerCase() === "true";
        }

        const uriReportingLevel = env.SCOUT_URI_REPORTING_LEVEL;
        if (typeof uriReportingLevel !== "undefined") {
            result.uriReportingLevel = parseLogLevel(uriReportingLevel);
        }

        // Default is true so we look for anything other than that
        if (env.SCOUT_CORE_AGENT_DOWNLOAD && env.SCOUT_CORE_AGENT_DOWNLOAD.toLowerCase() !== "true") {
            result.coreAgentDownload = false;
        }

        if (env.SCOUT_DOWNLOAD_URL) { result.downloadUrl = env.SCOUT_DOWNLOAD_URL; }
        if (env.SCOUT_CORE_AGENT_FULL_NAME) { result.coreAgentFullName = env.SCOUT_CORE_AGENT_FULL_NAME; }

        return result;
    }

    /**
     * For ScoutConfiguration from any object that allows `.get(...)` to be called,
     * for example, Express's `app` object
     *
     * @param {MapLike} obj - Some object that supports `get` method calls
     * @returns {Partial<ScoutConfiguration>} The generated scout configuration
     */
    public static fromMapLike(obj: MapLike): Partial<ScoutConfiguration> {
        const result: any = {};

        const applicationName = obj.get("scout.applicationName");
        if (applicationName) { result.applicationName = applicationName; }

        const key = obj.get("scout.key");
        if (key) { result.key = key; }

        const revisionSHA = obj.get("scout.revision.sha");
        if (typeof revisionSHA === "string") { result.revisionSHA = obj.get("scout.revision.sha"); }

        const logLevel = obj.get("scout.log.level");
        if (typeof logLevel === "string" && logLevel && Object.values(LogLevel).includes(obj.get("scout.log.level"))) {
            result.logLevel = logLevel as LogLevel;
        }

        const httpProxy = obj.get("scout.http.proxy");
        if (typeof httpProxy === "string") { result.httpProxy = httpProxy; }

        const hostname = obj.get("scout.hostname");
        if (typeof hostname === "string") { result.hostname = hostname; }

        const ignoredRoutePrefixes = obj.get("scout.ignoredRoutePrefixes");
        if (ignoredRoutePrefixes instanceof Array) {
            result.ignoredRoutePrefixes = ignoredRoutePrefixes;
        } else if (typeof ignoredRoutePrefixes === "string") {
            result.ignoredRoutePrefixes = ignoredRoutePrefixes.split(",").filter(v => v);
        }

        const collectRemoteIP = obj.get("scout.collectRemoteIP");
        if (typeof collectRemoteIP === "string" || typeof collectRemoteIP === "boolean") {
            result.collectRemoteIP = typeof collectRemoteIP === "string" ? collectRemoteIP === "true" : collectRemoteIP;
        }

        const uriReportingLevel = obj.get("scout.uriReportingLevel");
        if (typeof uriReportingLevel === "string" &&
            Object.values(LogLevel).includes(obj.get("scout.uriReportingLevel"))) {
            result.uriReportingLevel = uriReportingLevel as URIReportingLevel;
        }

        const coreAgentDownload = obj.get("scout.coreAgentDownload");
        if (typeof coreAgentDownload !== "undefined") { result.coreAgentDownload = coreAgentDownload; }

        const downloadUrl = obj.get("scout.downloadUrl");
        if (typeof downloadUrl === "string") { result.downloadUrl = downloadUrl; }

        const coreAgentFullName = obj.get("scout.coreAgentFullName");
        if (typeof coreAgentFullName === "string") { result.coreAgentFullName = coreAgentFullName; }

        return result;
    }

    /**
     * Build the default ScoutConfiguration
     *
     * @returns {ScoutConfiguration} The generated scout configuration
     */
    public static fromDefault(): ScoutConfiguration {
        return new ScoutConfiguration();
    }

    /**
     * Build a scout configuration
     *
     * @param {MapLike} - some object with a getter (e.x. `app.get(...)`)
     * @returns {ScoutConfiguration} The assembled configuration
     */
    public static build(app?: MapLike): ScoutConfiguration {
        return Object.assign(
            ScoutConfiguration.fromDefault(),
            app ? ScoutConfiguration.fromMapLike(app) : {},
            ScoutConfiguration.fromEnv(),
        );
    }

    // Application finger printing / auth
    public readonly applicationName: string = "";
    public readonly key: string = "";
    public readonly revisionSHA: string = "";

    // Operation
    public readonly logLevel: LogLevel = LogLevel.Info;
    public readonly logFilePath: "stdout" | string = "stdout";
    public readonly httpProxy?: string;
    public readonly allowShutdown: boolean = false;

    // Agent
    public readonly agentVersion: string = "1.1.8";
    public readonly apiVersion: string = "1.0";
    public readonly coreAgentDownload: boolean = true;
    public readonly coreAgentFullName: string;
    public readonly downloadUrl: string;

    // Machine information
    public readonly hostname: string = hostname();

    // Trace controls
    public readonly ignoredRoutePrefixes: string[] = [];
    public readonly collectRemoteIP: boolean = true;
    public readonly uriReportingLevel: URIReportingLevel = URIReportingLevel.FilteredParams;

    constructor(opts?: Partial<ScoutConfiguration>) {
        if (opts) {
            if (opts.applicationName) { this.applicationName = opts.applicationName; }
            if (opts.key) { this.key = opts.key; }
            if (opts.revisionSHA) { this.revisionSHA = opts.revisionSHA; }
            if (opts.logLevel) { this.logLevel = opts.logLevel; }
            if (opts.logFilePath) { this.logFilePath = opts.logFilePath; }
            if (opts.httpProxy) { this.httpProxy = opts.httpProxy; }
            if (opts.allowShutdown) { this.allowShutdown = opts.allowShutdown; }
            if (opts.agentVersion) { this.agentVersion = opts.agentVersion; }
            if (opts.apiVersion) { this.apiVersion = opts.apiVersion; }
            if (opts.hostname) { this.hostname = opts.hostname; }
            if (opts.ignoredRoutePrefixes) { this.ignoredRoutePrefixes = opts.ignoredRoutePrefixes; }
            if (opts.collectRemoteIP) { this.collectRemoteIP = opts.collectRemoteIP; }
            if (opts.uriReportingLevel) { this.uriReportingLevel = opts.uriReportingLevel; }
            if (opts.coreAgentFullName) { this.coreAgentFullName = opts.coreAgentFullName; }
            if (opts.downloadUrl) { this.downloadUrl = opts.downloadUrl; }

            // Boolean values
            if (typeof opts.coreAgentDownload !== "undefined") { this.coreAgentDownload = opts.coreAgentDownload; }
        }
    }

    /**
     * Build download options to be used with an AgentDownloader,
     * based on the options provided to Scout at the top level.
     *
     * @returns {AgentDownloadOptions}
     */
    public buildDownloadOptions(): Partial<AgentDownloadOptions> {
        return {
            coreAgentFullName: this.coreAgentFullName,
            disallowDownloads: !this.coreAgentDownload,
            downloadUrl: this.downloadUrl,
        };
    }
}

export class ApplicationMetadata {
    public readonly language: string;
    public readonly version: string;
    public readonly serverTime: string;
    public readonly framework: string;
    public readonly frameworkVersion: string;
    public readonly environment: string;
    public readonly appServer: string;
    public readonly hostname: string;
    public readonly databaseEngine: string;
    public readonly databaseAdapter: string;
    public readonly applicationName: string;
    public readonly libraries: string;
    public readonly paas: string;
    public readonly gitSHA: string;
}
