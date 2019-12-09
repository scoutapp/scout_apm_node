import { LogLevel } from "./enum";
import { snakeCase } from "snake-case";

export type LogFn = (message: string, level?: LogLevel) => void;

export type JSONValue = object | string | number;

export function convertCamelCaseToEnvVar(prop: string): string {
    return `SCOUT_${snakeCase(prop).toUpperCase()}`;
}
