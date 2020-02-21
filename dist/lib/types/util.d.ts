/// <reference types="node" />
import { LogLevel } from "./enum";
import * as winston from "winston";
export declare type LogFn = {
    (message: string, level?: LogLevel): void;
    logger?: any;
};
export declare type JSONValue = object | string | number;
export declare function convertCamelCaseToEnvVar(prop: string): string;
/**
 * Default implementation for logging simple messages to console
 *
 * @param {string} message
 * @param {LogLevel} level
 */
export declare function consoleLogFn(message: string, level?: LogLevel): void;
/**
 * Implementation for winston loggers
 *
 * @param {string} message
 * @param {LogLevel} level
 */
export declare function buildWinstonLogFn(logger: winston.Logger): LogFn;
export interface FramedHeadersWithRemaining {
    framed: Buffer[];
    remaining: Buffer;
}
/**
 * Check if a given data buffer contains more than one message
 *
 * @param {Buffer} buf - the data that was received
 * @returns {[Buffer[], Buffer]} completed properly framed buffers
 */
export declare function splitAgentResponses(buf: Buffer): FramedHeadersWithRemaining;
/**
 * Scrub the parameters of a given URL
 * this function modifies the provided URL object in-place.
 *
 * @param {string} path
 * @param {Object} lookup - A lookup dictionary of terms to scrub
 */
export declare function scrubRequestPathParams(path: string, lookup?: {
    [key: string]: boolean;
}): string;
/**
 * Scrub a URL down to only it's path (removing all query parameters)
 * this function modifies the provided URL object in-place.
 *
 * @param {string} path
 * @returns {string} the scrubbed path
 */
export declare function scrubRequestPath(path: string): string;
export interface Stoppable {
    stop(): Promise<this>;
    isStopped(): boolean;
}
export interface Startable {
    start(): Promise<this>;
    isStarted(): boolean;
}
export interface ScoutTag {
    name: string;
    value: JSONValue | JSONValue[];
}
export interface Taggable {
    addContext(tag: ScoutTag): Promise<this>;
    addContextSync(tag: ScoutTag): this;
    addContexts(tags: ScoutTag[]): Promise<this>;
    addContextsSync(tags: ScoutTag[]): this;
    getContextValue(name: string): JSONValue | JSONValue[] | undefined;
}
export interface ScoutStackFrame {
    line?: number;
    file?: string;
    function?: string;
}
