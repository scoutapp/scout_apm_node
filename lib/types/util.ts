import { LogLevel } from "./enum";
import { snakeCase } from "snake-case";

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
