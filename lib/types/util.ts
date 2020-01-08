import { LogLevel } from "./enum";
import { snakeCase } from "snake-case";
import * as winston from "winston";

export type LogFn = (message: string, level?: LogLevel) => void;

export type JSONValue = object | string | number;

export function convertCamelCaseToEnvVar(prop: string): string {
    return `SCOUT_${snakeCase(prop).toUpperCase()}`;
}

/**
 * Default implementation for logging simple messages to console
 *
 * @param {string} message
 * @param {LogLevel} level
 */
export function consoleLogFn(message: string, level?: LogLevel) {
    level = level || LogLevel.Info;
    const msg = `[${level.toUpperCase()}] ${message}`;

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
    return (message: string, level?: LogLevel) => {
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
            const [m, remainder] = [buf.slice(expected), buf.slice(expected, buf.length)];
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

// Common parameters to filter, copied from scout_apm_python
const DEFAULT_PARAM_FILTER_LOOKUP = {
    "access": true,
    "access_token": true,
    "api_key": true,
    "apikey": true,
    "auth": true,
    "auth_token": true,
    "card[number]": true,
    "certificate": true,
    "credentials": true,
    "crypt": true,
    "key": true,
    "mysql_pwd": true,
    "otp": true,
    "passwd": true,
    "password": true,
    "private": true,
    "protected": true,
    "salt": true,
    "secret": true,
    "ssn": true,
    "stripetoken": true,
    "token": true,
};

/**
 * Scrub the parameters of a given URL
 * this function modifies the provided URL object in-place.
 *
 * @param {URL} url
 * @param {Object} lookup - A lookup dictionary of terms to scrub
 */
export function scrubURLParams(url: URL, lookup?: { [key: string]: boolean }): URL {
    lookup = lookup || DEFAULT_PARAM_FILTER_LOOKUP;

    // TODO: implement

    return url;
}

/**
 * Scrub a URL down to only it's path (removing all query parameters)
 * this function modifies the provided URL object in-place.
 *
 * @param {URL} url
 * @returns {URL} the scrubbed URL
 */
export function scrubURLToPath(url: URL) {

    // TODO: implement

    return url;
}
