import { LogLevel } from "./enum";
import { snakeCase } from "snake-case";
import * as winston from "winston";
import * as Constants from "../constants";

export interface LogFn {
    (message: string, level?: LogLevel): void;

    logger?: winston.Logger;
}

export type JSONValue = object | string | number | boolean;

export function convertCamelCaseToEnvVar(prop: string): string {
    return `SCOUT_${snakeCase(prop).toUpperCase()}`;
}

export const LOG_LEVEL_VALUE = {
  [LogLevel.Error]: 0,
  [LogLevel.Warn]: 1,
  [LogLevel.Info]: 2,
  [LogLevel.Debug]: 3,
  [LogLevel.Trace]: 4,
};

export function isIgnoredLogMessage(applicationLevel: LogLevel, messageLevel: LogLevel): boolean {
    if (!(applicationLevel in LOG_LEVEL_VALUE)) { return false; }
    if (!(messageLevel in LOG_LEVEL_VALUE)) { return false; }

    return LOG_LEVEL_VALUE[messageLevel] > LOG_LEVEL_VALUE[applicationLevel];
}

/**
 * Default implementation for logging simple messages to console
 *
 * @param {string} message
 * @param {LogLevel} level
 */
export function consoleLogFn(message: string, level?: LogLevel) {
    level = level || LogLevel.Info;
    const time = new Date().toISOString();
    const msg = `[${time}] [${level.toUpperCase()}] ${message}`;

    switch (level) {
        case LogLevel.Warn:
            console.warn(msg); // tslint:disable-line no-console
            break;
        case LogLevel.Error:
            console.error(msg); // tslint:disable-line no-console
            break;
        case LogLevel.Debug:
            console.debug(msg); // tslint:disable-line no-console
            break;
        case LogLevel.Trace:
            console.trace(msg); // tslint:disable-line no-console
            break;
        default:
            console.log(msg); // tslint:disable-line no-console
    }
}

/**
 * Implementation for winston loggers
 *
 * @param {string} message
 * @param {LogLevel} level
 */
export function buildWinstonLogFn(logger: winston.Logger): LogFn {
    const fn = (message: string, level?: LogLevel) => {
        level = level || LogLevel.Info;

        switch (level) {
            case LogLevel.Error:
                logger.error(message);
                break;
            case LogLevel.Warn:
                logger.warn(message);
                break;
            case LogLevel.Debug:
                logger.debug(message);
                break;
            case LogLevel.Trace:
                logger.silly(message);
                break;
            default:
                logger.log({level, message});
        }
    };

    fn.logger = logger;

    return fn;
}

// Correctly framed headers and the remainder (if any)
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
export function splitAgentResponses(buf: Buffer): FramedHeadersWithRemaining {
    // If buf isn't long enough to contain a proper 4 byte content length + msg
    // then we know no messages are present but it *might* be a chunked message
    if (buf.length < 5) {
        return {framed: [], remaining: buf};
    }

    const framed: Buffer[] = [];
    let remaining: Buffer = Buffer.from([]);

    while (buf.length > 0) {
        // Pull and check the payload length
        const payloadLen: number = buf.readUInt32BE(0);
        const expected = payloadLen + 4; // length of payload + initial length

        // If we get exactly the right amount return because we have the framed amount
        if (buf.length === expected) {
            framed.push(buf);
            break;
        }

        // If we have more in the whole buffer than expected, save the first chunk then remainder
        if (buf.length > expected) {
            // Split the buffer into payload & remaining
            const [m, remainder] = [buf.slice(0, expected), buf.slice(expected, buf.length)];
            framed.push(m);
            buf = remainder;
            continue;
        }

        // Less than expected case, we want to leave
        remaining = buf;
        break;
    }

    return {framed, remaining};
}

/**
 * Scrub the parameters of a given URL
 * this function modifies the provided URL object in-place.
 *
 * @param {string} path
 * @param {Object} lookup - A lookup dictionary of terms to scrub
 */
export function scrubRequestPathParams(
    path: string,
    lookup?: { [key: string]: boolean },
): string {
    lookup = lookup || Constants.DEFAULT_PARAM_FILTER_LOOKUP;

    const pieces = path.split("?");

    // If there are no search params, then return the path unchanged
    if (pieces.length === 1) { return path; }

    const parsedParams = new URLSearchParams("?" + pieces[1]);

    parsedParams.forEach((_, k) => {
        if (lookup && k in lookup) {
            parsedParams.set(k, Constants.DEFAULT_PARAM_SCRUB_REPLACEMENT);
        }
    });

    return `${pieces[0]}?${decodeURI(parsedParams.toString())}`;
}

/**
 * Scrub a URL down to only it's path (removing all query parameters)
 * this function modifies the provided URL object in-place.
 *
 * @param {string} path
 * @returns {string} the scrubbed path
 */
export function scrubRequestPath(path: string): string {
    return path.split("?")[0];
}

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

export function isScoutTag(obj: any): obj is ScoutTag {
    return obj && "name" in obj && "value" in obj;
}

export interface Taggable {
    // Add a single context
    addContext(name: string, value: JSONValue | JSONValue[]): Promise<this>;
    addContextSync(name: string, value: JSONValue | JSONValue[]): this;

    // Add multiple pieces of context
    addContexts(tags: ScoutTag[]): Promise<this>;
    addContextsSync(tags: ScoutTag[]): this;

    // Retrieve the value of context value by name
    getContextValue(name: string): JSONValue | JSONValue[] | undefined;
}

export interface ScoutStackFrame {
    line?: number;
    file?: string;
    function?: string;
}

export function waitMs(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, ms);
    });
}
