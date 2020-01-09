"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var APIVersion;
(function (APIVersion) {
    APIVersion["V1"] = "1.0";
})(APIVersion = exports.APIVersion || (exports.APIVersion = {}));
var URIReportingLevel;
(function (URIReportingLevel) {
    URIReportingLevel["FilteredParams"] = "filtered-params";
    URIReportingLevel["PathOnly"] = "path-only";
})(URIReportingLevel = exports.URIReportingLevel || (exports.URIReportingLevel = {}));
var AgentType;
(function (AgentType) {
    AgentType["Process"] = "process";
})(AgentType = exports.AgentType || (exports.AgentType = {}));
var LogLevel;
(function (LogLevel) {
    LogLevel["Info"] = "info";
    LogLevel["Warn"] = "warn";
    LogLevel["Debug"] = "debug";
    LogLevel["Trace"] = "trace";
    LogLevel["Error"] = "error";
})(LogLevel = exports.LogLevel || (exports.LogLevel = {}));
var ApplicationEventType;
(function (ApplicationEventType) {
    ApplicationEventType["ScoutMetadata"] = "scout.metadata";
    ApplicationEventType["CPUUtilizationPercent"] = "CPU/Utilization";
    ApplicationEventType["MemoryUsageMB"] = "Memory/Physical";
})(ApplicationEventType = exports.ApplicationEventType || (exports.ApplicationEventType = {}));
var AgentEvent;
(function (AgentEvent) {
    AgentEvent["SocketResponseReceived"] = "socket-response-received";
    AgentEvent["SocketResponseParseError"] = "socket-response-parse-error";
    AgentEvent["SocketDisconnected"] = "socket-disconnected";
    AgentEvent["SocketError"] = "socket-error";
    AgentEvent["SocketConnected"] = "socket-connected";
    AgentEvent["RequestSent"] = "request-sent";
    AgentEvent["RequestStarted"] = "request-started";
    AgentEvent["RequestFinished"] = "request-finished";
    AgentEvent["SpanStarted"] = "span-started";
    AgentEvent["SpanStopped"] = "span-stopped";
    AgentEvent["ApplicationEventReported"] = "application-event-reported";
})(AgentEvent = exports.AgentEvent || (exports.AgentEvent = {}));
var AgentRequestType;
(function (AgentRequestType) {
    AgentRequestType["V1GetVersion"] = "v1-get-version";
    AgentRequestType["V1Register"] = "v1-register";
    AgentRequestType["V1StartRequest"] = "v1-start-request";
    AgentRequestType["V1FinishRequest"] = "v1-finish-request";
    AgentRequestType["V1TagRequest"] = "v1-tag-request";
    AgentRequestType["V1StartSpan"] = "v1-start-span";
    AgentRequestType["V1StopSpan"] = "v1-stop-span";
    AgentRequestType["V1TagSpan"] = "v1-tag-span";
    AgentRequestType["V1ApplicationEvent"] = "v1-application-event";
})(AgentRequestType = exports.AgentRequestType || (exports.AgentRequestType = {}));
var AgentResponseType;
(function (AgentResponseType) {
    AgentResponseType["Unknown"] = "unknown";
    AgentResponseType["V1GetVersion"] = "v1-get-version-response";
    AgentResponseType["V1Register"] = "v1-register-response";
    AgentResponseType["V1StartRequest"] = "v1-start-request-response";
    AgentResponseType["V1FinishRequest"] = "v1-finish-request-response";
    AgentResponseType["V1TagRequest"] = "v1-tag-request-response";
    AgentResponseType["V1StartSpan"] = "v1-start-span-response";
    AgentResponseType["V1StopSpan"] = "v1-stop-span-response";
    AgentResponseType["V1TagSpan"] = "v1-tag-span-response";
    AgentResponseType["V1ApplicationEvent"] = "v1-application-event-response";
    AgentResponseType["V1Failure"] = "v1-failure-response";
})(AgentResponseType = exports.AgentResponseType || (exports.AgentResponseType = {}));
/**
 * Parse a string into a log level
 *
 * @throws Error if the log level is invalid
 * @returns {LogLevel}
 */
function parseLogLevel(lvl) {
    if (Object.values(LogLevel).includes(lvl)) {
        return lvl;
    }
    throw new Error(`Invalid log level [${lvl}]`);
}
exports.parseLogLevel = parseLogLevel;
var ConfigSourceName;
(function (ConfigSourceName) {
    ConfigSourceName["Env"] = "env";
    ConfigSourceName["Node"] = "node";
    ConfigSourceName["Derived"] = "derived";
    ConfigSourceName["Default"] = "default";
})(ConfigSourceName = exports.ConfigSourceName || (exports.ConfigSourceName = {}));
var Architecture;
(function (Architecture) {
    Architecture["X86_64"] = "x86_64";
    Architecture["I686"] = "i686";
    Architecture["Unknown"] = "unknown";
})(Architecture = exports.Architecture || (exports.Architecture = {}));
var Platform;
(function (Platform) {
    Platform["LinuxGNU"] = "unknown-linux-gnu";
    Platform["LinuxMusl"] = "unknown-linux-musl";
    Platform["Darwin"] = "apple-darwin";
    Platform["Unknown"] = "unknown";
})(Platform = exports.Platform || (exports.Platform = {}));
var PlatformTriple;
(function (PlatformTriple) {
    PlatformTriple["GNULinux32"] = "i686-unknown-linux-gnu";
    PlatformTriple["GNULinux64"] = "x86_64-unknown-linux-gnu";
    PlatformTriple["MuslLinux64"] = "x86_64-unknown-linux-musl";
    PlatformTriple["AppleDarwin64"] = "x86_64-apple-darwin";
})(PlatformTriple = exports.PlatformTriple || (exports.PlatformTriple = {}));
