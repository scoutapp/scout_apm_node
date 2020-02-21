/// <reference types="node" />
import * as net from "net";
import { Application } from "express";
import { ChildProcess } from "child_process";
import { Client } from "pg";
import { Connection } from "mysql";
import ExternalProcessAgent from "../lib/agents/external-process";
import { APIVersion, Agent, CoreAgentVersion, ProcessOptions, ScoutConfiguration, ExpressFn } from "../lib/types";
import { ScoutOptions } from "../lib/scout";
import { Scout } from "../lib";
import { Test } from "tape";
export declare const EXPRESS_TEST_TIMEOUT_MS = 3000;
export declare const PG_TEST_TIMEOUT_MS = 5000;
export declare const MYSQL_TEST_TIMEOUT_MS = 5000;
export declare const DASHBOARD_SEND_TIMEOUT_MS: number;
export declare function bootstrapExternalProcessAgent(t: Test, rawVersion: string, opts?: {
    buildProcOpts?: (bp: string, uri: string) => ProcessOptions;
}): Promise<ExternalProcessAgent>;
export declare function initializeAgent(t: Test, agent: Agent, appName: string, agentKey: string, appVersion: CoreAgentVersion, apiVersion?: APIVersion): Promise<Agent>;
export declare function waitMs(ms: number, t?: Test): Promise<void>;
export declare function waitMinutes(mins: number, t?: Test): Promise<void>;
export declare function cleanup(t: Test, agent: ExternalProcessAgent, err?: Error): Promise<void>;
export declare function waitForAgentBufferFlush(t?: Test): Promise<void>;
export declare function shutdownScout(t: Test, scout: Scout, err?: Error): Promise<void>;
export declare function simpleExpressApp(middleware: any, delayMs?: number): Application;
export declare function simpleDynamicSegmentExpressApp(middleware: any, delayMs?: number): Application;
export declare function simpleErrorApp(middleware: any, delayMs?: number): Application;
export declare function simpleHTML5BoilerplateApp(middleware: any, templateEngine: "pug" | "ejs" | "mustache"): Application;
export declare function simpleInstrumentApp(middleware: any): Application;
export declare function appWithGETSynchronousError(middleware: any, expressFnTransform: (expressFn: ExpressFn) => ExpressFn): Application;
export declare function testConfigurationOverlay(t: Test, opts: {
    appKey: string;
    envValue: string;
    expectedValue: any;
}): void;
export declare function buildCoreAgentSocketResponse(json: string): Buffer;
export declare function buildTestScoutInstance(configOverride?: Partial<ScoutConfiguration>, options?: Partial<ScoutOptions>): Scout;
export interface WaitForConfigFn {
    timeoutMs: number;
    check: (cao: ContainerAndOpts) => Promise<boolean>;
}
export interface WaitForConfig {
    stdout?: string;
    stderr?: string;
    milliseconds?: number;
    fn?: WaitForConfigFn;
}
export declare class TestContainerStartOpts {
    readonly dockerBinPath: string;
    readonly waitFor: WaitForConfig;
    readonly startTimeoutMs: number;
    readonly killTimeoutMs: number;
    imageName: string;
    tagName: string;
    containerName: string;
    envBinding: object;
    executedStartCommand: string;
    portBinding: {
        [key: number]: number;
    };
    constructor(opts: Partial<TestContainerStartOpts>);
    imageWithTag(): string;
    setExecutedStartCommand(cmd: string): void;
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
export declare function startContainer(t: Test, optOverrides: Partial<TestContainerStartOpts>): Promise<ContainerAndOpts>;
export declare function killContainer(t: Test, opts: TestContainerStartOpts): Promise<number>;
export declare function startContainerizedPostgresTest(test: any, cb: (cao: ContainerAndOpts) => void, containerEnv?: object, tagName?: string): void;
export declare function stopContainerizedInstanceTest(test: any, provider: () => ContainerAndOpts | null, name: string): void;
export declare function stopContainerizedPostgresTest(test: any, provider: () => ContainerAndOpts | null): void;
export declare function makeConnectedPGClient(provider: () => ContainerAndOpts | null): Promise<Client>;
declare type ServerShutdownFn = () => void;
export declare function createClientCollectingServer(): [net.Server, ServerShutdownFn];
export declare function startContainerizedMySQLTest(test: any, cb: (cao: ContainerAndOpts) => void, opts?: {
    containerEnv?: object;
    tagName?: string;
    mysqlPackageName?: "mysql" | "mysql2";
}): void;
export declare function stopContainerizedMySQLTest(test: any, provider: () => ContainerAndOpts | null): void;
export declare function makeConnectedMySQLConnection(provider: () => ContainerAndOpts | null): Promise<Connection>;
export declare function makeConnectedMySQL2Connection(provider: () => ContainerAndOpts | null): Promise<Connection>;
export {};
