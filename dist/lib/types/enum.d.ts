export declare enum APIVersion {
    V1 = "1.0"
}
export declare enum URIReportingLevel {
    FilteredParams = "filtered-params",
    Path = "path"
}
export declare enum AgentType {
    Process = "process"
}
export declare enum LogLevel {
    Info = "info",
    Warn = "warn",
    Debug = "debug",
    Trace = "trace",
    Error = "error"
}
export declare enum ApplicationEventType {
    ScoutMetadata = "scout.metadata",
    CPUUtilizationPercent = "CPU/Utilization",
    MemoryUsageMB = "Memory/Physical"
}
export declare enum AgentEvent {
    SocketResponseReceived = "agent-event-socket-response-received",
    SocketResponseParseError = "agent-event-socket-response-parse-error",
    SocketDisconnected = "agent-event-socket-disconnected",
    SocketError = "agent-event-socket-error",
    SocketConnected = "agent-event-socket-connected",
    RequestSent = "agent-event-request-sent",
    RequestStarted = "agent-event-request-started",
    RequestFinished = "agent-event-request-finished",
    SpanStarted = "agent-event-span-started",
    SpanStopped = "agent-event-span-stopped",
    ApplicationEventReported = "agent-event-application-event-reported"
}
export declare enum AgentRequestType {
    V1GetVersion = "v1-get-version",
    V1Register = "v1-register",
    V1StartRequest = "v1-start-request",
    V1FinishRequest = "v1-finish-request",
    V1TagRequest = "v1-tag-request",
    V1StartSpan = "v1-start-span",
    V1StopSpan = "v1-stop-span",
    V1TagSpan = "v1-tag-span",
    V1ApplicationEvent = "v1-application-event"
}
export declare enum AgentResponseType {
    Unknown = "unknown",
    V1GetVersion = "v1-get-version-response",
    V1Register = "v1-register-response",
    V1StartRequest = "v1-start-request-response",
    V1FinishRequest = "v1-finish-request-response",
    V1TagRequest = "v1-tag-request-response",
    V1StartSpan = "v1-start-span-response",
    V1StopSpan = "v1-stop-span-response",
    V1TagSpan = "v1-tag-span-response",
    V1ApplicationEvent = "v1-application-event-response",
    V1Failure = "v1-failure-response"
}
/**
 * Parse a string into a log level
 *
 * @throws Error if the log level is invalid
 * @returns {LogLevel}
 */
export declare function parseLogLevel(lvl: string): LogLevel;
export declare enum ConfigSourceName {
    Env = "env",
    Node = "node",
    Derived = "derived",
    Default = "default"
}
export declare enum Architecture {
    X86_64 = "x86_64",
    I686 = "i686",
    Unknown = "unknown"
}
export declare enum Platform {
    LinuxGNU = "unknown-linux-gnu",
    LinuxMusl = "unknown-linux-musl",
    Darwin = "apple-darwin",
    Unknown = "unknown"
}
export declare enum PlatformTriple {
    GNULinux32 = "i686-unknown-linux-gnu",
    GNULinux64 = "x86_64-unknown-linux-gnu",
    MuslLinux64 = "x86_64-unknown-linux-musl",
    AppleDarwin64 = "x86_64-apple-darwin"
}
export declare enum ScoutEvent {
    IgnoredPathDetected = "scout-event-ignored-path-detected",
    RequestSent = "scout-event-request-sent"
}
export declare enum ScoutContextName {
    Traceback = "stack",
    DBStatement = "db.statement",
    Error = "error",
    Name = "name",
    URL = "url",
    Timeout = "timeout"
}
export declare enum ScoutSpanOperation {
    SQLQuery = "SQL/Query",
    TemplateRender = "Template/Render",
    HTTPGet = "HTTP/GET",
    HTTPPost = "HTTP/POST",
    HTTPDelete = "HTTP/DELETE",
    HTTPPut = "HTTP/PUT",
    HTTPPatch = "HTTP/PATCH"
}
