import {LogLevel} from "./enum";

export type LogFn = (message: string, level?: LogLevel) => void;

export type JSONValue = object | string | number;
