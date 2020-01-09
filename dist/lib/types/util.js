"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const enum_1 = require("./enum");
const snake_case_1 = require("snake-case");
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
    const msg = `[${level.toUpperCase()}] ${message}`;
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
    return (message, level) => {
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
            const [m, remainder] = [buf.slice(expected), buf.slice(expected, buf.length)];
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
