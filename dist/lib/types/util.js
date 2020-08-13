"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitMs = exports.isScoutTag = exports.scrubRequestPath = exports.scrubRequestPathParams = exports.splitAgentResponses = exports.buildWinstonLogFn = exports.consoleLogFn = exports.convertCamelCaseToEnvVar = void 0;
const enum_1 = require("./enum");
const snake_case_1 = require("snake-case");
const Constants = require("../constants");
function convertCamelCaseToEnvVar(prop) {
    return `SCOUT_${snake_case_1.snakeCase(prop).toUpperCase()}`;
}
exports.convertCamelCaseToEnvVar = convertCamelCaseToEnvVar;
/**
 * Default implementation for logging simple messages to console
 *
 * @param {string} message
 * @param {LogLevel} level
 */
function consoleLogFn(message, level) {
    level = level || enum_1.LogLevel.Info;
    const time = new Date().toISOString();
    const msg = `[${time}] [${level.toUpperCase()}] ${message}`;
    switch (level) {
        case enum_1.LogLevel.Warn:
            console.warn(msg); // tslint:disable-line no-console
            break;
        case enum_1.LogLevel.Error:
            console.error(msg); // tslint:disable-line no-console
            break;
        case enum_1.LogLevel.Debug:
            console.debug(msg); // tslint:disable-line no-console
            break;
        case enum_1.LogLevel.Trace:
            console.trace(msg); // tslint:disable-line no-console
            break;
        default:
            console.log(msg); // tslint:disable-line no-console
    }
}
exports.consoleLogFn = consoleLogFn;
/**
 * Implementation for winston loggers
 *
 * @param {string} message
 * @param {LogLevel} level
 */
function buildWinstonLogFn(logger) {
    const fn = (message, level) => {
        level = level || enum_1.LogLevel.Info;
        switch (level) {
            case enum_1.LogLevel.Error:
                logger.error(message);
                break;
            case enum_1.LogLevel.Warn:
                logger.warn(message);
                break;
            case enum_1.LogLevel.Debug:
                logger.debug(message);
                break;
            case enum_1.LogLevel.Trace:
                logger.silly(message);
                break;
            default:
                logger.log({ level, message });
        }
    };
    fn.logger = logger;
    return fn;
}
exports.buildWinstonLogFn = buildWinstonLogFn;
/**
 * Check if a given data buffer contains more than one message
 *
 * @param {Buffer} buf - the data that was received
 * @returns {[Buffer[], Buffer]} completed properly framed buffers
 */
function splitAgentResponses(buf) {
    // If buf isn't long enough to contain a proper 4 byte content length + msg
    // then we know no messages are present but it *might* be a chunked message
    if (buf.length < 5) {
        return { framed: [], remaining: buf };
    }
    const framed = [];
    let remaining = Buffer.from([]);
    while (buf.length > 0) {
        // Pull and check the payload length
        const payloadLen = buf.readUInt32BE(0);
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
    return { framed, remaining };
}
exports.splitAgentResponses = splitAgentResponses;
/**
 * Scrub the parameters of a given URL
 * this function modifies the provided URL object in-place.
 *
 * @param {string} path
 * @param {Object} lookup - A lookup dictionary of terms to scrub
 */
function scrubRequestPathParams(path, lookup) {
    lookup = lookup || Constants.DEFAULT_PARAM_FILTER_LOOKUP;
    const pieces = path.split("?");
    // If there are no search params, then return the path unchanged
    if (pieces.length === 1) {
        return path;
    }
    const parsedParams = new URLSearchParams("?" + pieces[1]);
    parsedParams.forEach((_, k) => {
        if (lookup && k in lookup) {
            parsedParams.set(k, Constants.DEFAULT_PARAM_SCRUB_REPLACEMENT);
        }
    });
    return `${pieces[0]}?${decodeURI(parsedParams.toString())}`;
}
exports.scrubRequestPathParams = scrubRequestPathParams;
/**
 * Scrub a URL down to only it's path (removing all query parameters)
 * this function modifies the provided URL object in-place.
 *
 * @param {string} path
 * @returns {string} the scrubbed path
 */
function scrubRequestPath(path) {
    return path.split("?")[0];
}
exports.scrubRequestPath = scrubRequestPath;
function isScoutTag(obj) {
    return obj && "name" in obj && "value" in obj;
}
exports.isScoutTag = isScoutTag;
function waitMs(ms) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, ms);
    });
}
exports.waitMs = waitMs;
