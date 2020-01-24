"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var APIVersion;
(function (APIVersion) {
    APIVersion["V1"] = "1.0";
})(APIVersion = exports.APIVersion || (exports.APIVersion = {}));
var URIReportingLevel;
(function (URIReportingLevel) {
    URIReportingLevel["FilteredParams"] = "filtered-params";
    URIReportingLevel["Path"] = "path";
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
    AgentEvent["SocketResponseReceived"] = "agent-event-socket-response-received";
    AgentEvent["SocketResponseParseError"] = "agent-event-socket-response-parse-error";
    AgentEvent["SocketDisconnected"] = "agent-event-socket-disconnected";
    AgentEvent["SocketError"] = "agent-event-socket-error";
    AgentEvent["SocketConnected"] = "agent-event-socket-connected";
    AgentEvent["RequestSent"] = "agent-event-request-sent";
    AgentEvent["RequestStarted"] = "agent-event-request-started";
    AgentEvent["RequestFinished"] = "agent-event-request-finished";
    AgentEvent["SpanStarted"] = "agent-event-span-started";
    AgentEvent["SpanStopped"] = "agent-event-span-stopped";
    AgentEvent["ApplicationEventReported"] = "agent-event-application-event-reported";
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
var ScoutEvent;
(function (ScoutEvent) {
    ScoutEvent["IgnoredPathDetected"] = "scout-event-ignored-path-detected";
    ScoutEvent["RequestSent"] = "scout-event-request-sent";
})(ScoutEvent = exports.ScoutEvent || (exports.ScoutEvent = {}));
var ScoutContextNames;
(function (ScoutContextNames) {
    ScoutContextNames["Traceback"] = "stack";
    ScoutContextNames["DBStatement"] = "db.statement";
    ScoutContextNames["Error"] = "error";
    ScoutContextNames["Name"] = "name";
    ScoutContextNames["URL"] = "url";
})(ScoutContextNames = exports.ScoutContextNames || (exports.ScoutContextNames = {}));
var ScoutSpanOperation;
(function (ScoutSpanOperation) {
    ScoutSpanOperation["SQLQuery"] = "SQL/Query";
    ScoutSpanOperation["TemplateRender"] = "Template/Render";
    ScoutSpanOperation["HTTPGet"] = "HTTP/GET";
    ScoutSpanOperation["HTTPPost"] = "HTTP/POST";
    ScoutSpanOperation["HTTPDelete"] = "HTTP/DELETE";
    ScoutSpanOperation["HTTPPut"] = "HTTP/PUT";
    ScoutSpanOperation["HTTPPatch"] = "HTTP/PATCH";
})(ScoutSpanOperation = exports.ScoutSpanOperation || (exports.ScoutSpanOperation = {}));
