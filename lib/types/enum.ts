export enum APIVersion {
    V1 = "1.0",
}

export enum URIReportingLevel {
    FilteredParams = "filtered-params",
    Path = "path",
}

export enum AgentType {
    Process = "process",
}

export enum LogLevel {
    Info = "info",
    Warn = "warn",
    Debug = "debug",
    Trace = "trace",
    Error = "error",
}

export enum ApplicationEventType {
    ScoutMetadata = "scout.metadata",

    CPUUtilizationPercent = "CPU/Utilization",
    MemoryUsageMB = "Memory/Physical",
}

export enum AgentEvent {
    SocketResponseReceived = "socket-response-received",
    SocketResponseParseError = "socket-response-parse-error",
    SocketDisconnected = "socket-disconnected",
    SocketError = "socket-error",
    SocketConnected = "socket-connected",

    RequestSent = "request-sent",

    RequestStarted = "request-started",
    RequestFinished = "request-finished",

    SpanStarted = "span-started",
    SpanStopped = "span-stopped",

    ApplicationEventReported = "application-event-reported",
}

export enum AgentRequestType {
    V1GetVersion = "v1-get-version",
    V1Register = "v1-register",

    V1StartRequest = "v1-start-request",
    V1FinishRequest = "v1-finish-request",
    V1TagRequest = "v1-tag-request",

    V1StartSpan = "v1-start-span",
    V1StopSpan = "v1-stop-span",
    V1TagSpan = "v1-tag-span",

    V1ApplicationEvent = "v1-application-event",
}

export enum AgentResponseType {
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

    V1Failure = "v1-failure-response",
}

/**
 * Parse a string into a log level
 *
 * @throws Error if the log level is invalid
 * @returns {LogLevel}
 */
export function parseLogLevel(lvl: string): LogLevel {
    if (Object.values(LogLevel).includes(lvl as LogLevel)) {
        return lvl as LogLevel;
    }
    throw new Error(`Invalid log level [${lvl}]`);
}

export enum ConfigSourceName {
    Env = "env",
    Node = "node",
    Derived = "derived",
    Default = "default",
}

export enum Architecture {
    X86_64 = "x86_64",
    I686 = "i686",
    Unknown = "unknown",
}

export enum Platform {
    LinuxGNU = "unknown-linux-gnu",
    LinuxMusl = "unknown-linux-musl",
    Darwin = "apple-darwin",
    Unknown = "unknown",
}

export enum PlatformTriple {
    GNULinux32 = "i686-unknown-linux-gnu",
    GNULinux64 = "x86_64-unknown-linux-gnu",
    MuslLinux64 = "x86_64-unknown-linux-musl",
    AppleDarwin64 = "x86_64-apple-darwin",
}
