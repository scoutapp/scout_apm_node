import { LogLevel, URIReportingLevel } from "./enum";
import { AgentDownloadOptions } from "./downloader";
import { LogFn } from "./util";
import { ProcessOptions } from "./agent";
import { PlatformTriple } from "./enum";
export declare class ApplicationMetadata {
    readonly language: string;
    readonly languageVersion: string;
    readonly serverTime: string;
    readonly framework: string;
    readonly frameworkVersion: string;
    readonly environment: string;
    readonly appServer: string;
    readonly hostname: string;
    readonly databaseEngine: string;
    readonly databaseAdapter: string;
    readonly applicationName: string;
    readonly libraries: Array<[string, any]>;
    readonly paas: string;
    readonly gitSHA: string;
    readonly applicationRoot: string;
    readonly scmSubdirectory: string;
    constructor(config: Partial<ScoutConfiguration>, opts?: Partial<ApplicationMetadata>);
    /**
     * Generate a version of the ApplicationMetadata that is formatted as core-agent expects it to be
     *
     * @returns {Object} ApplicationMetadata with keys/values as core-agent expects
     */
    serialize(): object;
}
export interface ScoutConfiguration {
    name: string;
    key: string;
    revisionSHA: string;
    appServer: string;
    applicationRoot: string;
    scmSubdirectory: string;
    logLevel: LogLevel;
    socketPath: string;
    logFilePath: "stdout" | string;
    httpProxy: string;
    allowShutdown: boolean;
    monitor: boolean;
    framework: string;
    frameworkVersion: string;
    apiVersion: string;
    downloadUrl: string;
    coreAgentDownload: boolean;
    coreAgentLaunch: boolean;
    coreAgentDir: string;
    coreAgentLogLevel: LogLevel;
    coreAgentPermissions: number;
    coreAgentVersion: string;
    hostname: string | null;
    ignore: string[];
    collectRemoteIP: boolean;
    uriReporting: URIReportingLevel;
    disabledInstruments: string[];
    coreAgentTriple: string;
    coreAgentFullName: string;
}
export declare const DEFAULT_SCOUT_CONFIGURATION: Partial<ScoutConfiguration>;
export declare function detectPlatformTriple(): PlatformTriple;
export declare function generateTriple(): string;
interface ScoutConfigurationProxyOptions {
    env?: any;
    logFn?: LogFn;
}
/**
 * ScoutConfiguration is a proxy that encapsulates a *raw* configuration object
 * It takes sources but it's job is to
 */
export declare class ScoutConfigurationProxy {
    private readonly nodeConfigSource;
    private readonly sources;
    constructor(initialNodeConfig?: Partial<ScoutConfiguration>, opts?: ScoutConfigurationProxyOptions);
    get(obj: any, prop: string): any;
    set(obj: any, prop: string, value: any): boolean;
}
/**
 * Build a ScoutConfiguration object, which is actually a Proxy which checks other sources,
 * a thin wrapper for the ScoutConfiguration to ensure values are pulled from appropriate sources
 */
export declare function buildScoutConfiguration(initialNodeConfig?: Partial<ScoutConfiguration>, opts?: ScoutConfigurationProxyOptions): Partial<ScoutConfiguration>;
/**
 * Build download options to be used with an AgentDownloader,
 * based on the options provided to Scout at the top level.
 *
 * @returns {AgentDownloadOptions}
 */
export declare function buildDownloadOptions(config: Partial<ScoutConfiguration>): Partial<AgentDownloadOptions>;
/**
 * Build download options to be used with an AgentDownloader,
 * based on the options provided to Scout at the top level.
 *
 * @returns {ProcessOptions}
 */
export declare function buildProcessOptions(config: Partial<ScoutConfiguration>): Partial<ProcessOptions>;
export {};
