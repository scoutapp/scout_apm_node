export { TimeoutError } from "promise-timeout";
export declare enum ErrorCode {
    NotImplemented = 0,
    InvalidVersion = 1,
    UnsupportedVersion = 2,
    UnexpectedError = 3,
    InvalidAgentDownloadConfig = 4,
    NoProcessReference = 5,
    Disconnected = 6,
    MalformedAgentResponse = 7,
    UnrecognizedAgentResponse = 8,
    ExternalDownloadDisallowed = 9,
    RequestDoesNotPromptResponse = 10,
    MissingRequiredFeature = 11,
    ResourceAllocationFailure = 12,
    ResourceAllocationFailureLimitExceeded = 13,
    NotSupported = 14,
    FinishedRequest = 15,
    ConnectionPoolDisabled = 16,
    AgentLaunchDisabled = 17,
    MonitoringDisabled = 18,
    NoAgentPresent = 19,
    NoActiveParentContext = 20,
    InvalidConfiguration = 21,
    InstanceNotReady = 22
}
declare class ScoutError extends Error {
    readonly code: number;
}
export declare class NotImplemented extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class InvalidVersion extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class UnsupportedVersion extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class UnexpectedError extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class InvalidAgentDownloadConfig extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class NoProcessReference extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class Disconnected extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class MalformedAgentResponse extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class UnrecognizedAgentResponse extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class ExternalDownloadDisallowed extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class RequestDoesNotPromptResponse extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class MissingRequiredFeature extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class ResourceAllocationFailure extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class ResourceAllocationFailureLimitExceeded extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class NotSupported extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class FinishedRequest extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class ConnectionPoolDisabled extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class AgentLaunchDisabled extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class MonitoringDisabled extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class NoAgentPresent extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class NoActiveParentContext extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class InvalidConfiguration extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
export declare class InstanceNotReady extends ScoutError {
    readonly code: number;
    constructor(m?: string);
}
