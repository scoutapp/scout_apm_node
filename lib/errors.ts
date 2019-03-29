export enum ErrorCode {
    NotImplemented,
    InvalidVersion,
    UnsupportedVersion,
    UnexpectedError,
    InvalidAgentDownloadConfig,
    NoProcessReference,
    Disconnected,
    MalformedAgentResponse,
    UnrecognizedAgentResponse,
    ExternalDownloadDisallowed,
    RequestDoesNotPromptResponse,
    MissingRequiredFeature,
    ResourceAllocationFailure,
    ResourceAllocationFailureLimitExceeded,
    NotSupported,
}

class ScoutError extends Error {
    public readonly code: number;
}

export class NotImplemented extends ScoutError {
    public readonly code: number = ErrorCode.NotImplemented;

    constructor(m?: string) {
        super();
        this.message = m || "Not implemented";
    }
}

export class InvalidVersion extends ScoutError {
    public readonly code: number = ErrorCode.InvalidVersion;

    constructor(m?: string) {
        super();
        this.message = m || "Invalid version specified";
    }
}

export class UnsupportedVersion extends ScoutError {
    public readonly code: number = ErrorCode.UnsupportedVersion;

    constructor(m?: string) {
        super();
        this.message = m || "Unsupported version specified";
    }
}

export class UnexpectedError extends ScoutError {
    public readonly code: number = ErrorCode.UnexpectedError;

    constructor(m?: string) {
        super();
        this.message = m || "Unexpected error";
    }
}

export class InvalidAgentDownloadConfig extends ScoutError {
    public readonly code: number = ErrorCode.InvalidAgentDownloadConfig;

    constructor(m?: string) {
        super();
        this.message = m || "Invalid agent download configuration";
    }
}

export class NoProcessReference extends ScoutError {
    public readonly code: number = ErrorCode.NoProcessReference;

    constructor(m?: string) {
        super();
        this.message = m || "No process reference present (core-agent was not spawned by this process)";
    }
}

export class Disconnected extends ScoutError {
    public readonly code: number = ErrorCode.Disconnected;

    constructor(m?: string) {
        super();
        this.message = m || "Agent is disconnected";
    }
}

export class MalformedAgentResponse extends ScoutError {
    public readonly code: number = ErrorCode.MalformedAgentResponse;

    constructor(m?: string) {
        super();
        this.message = m || "Agent is disconnected";
    }
}

export class UnrecognizedAgentResponse extends ScoutError {
    public readonly code: number = ErrorCode.UnrecognizedAgentResponse;

    constructor(m?: string) {
        super();
        this.message = m || "Agent is disconnected";
    }
}

export class ExternalDownloadDisallowed extends ScoutError {
    public readonly code: number = ErrorCode.ExternalDownloadDisallowed;

    constructor(m?: string) {
        super();
        this.message = m || "External downloads disallowed";
    }
}

export class RequestDoesNotPromptResponse extends ScoutError {
    public readonly code: number = ErrorCode.RequestDoesNotPromptResponse;

    constructor(m?: string) {
        super();
        this.message = m || "The given request does not prompt a response";
    }
}

export class MissingRequiredFeature extends ScoutError {
    public readonly code: number = ErrorCode.MissingRequiredFeature;

    constructor(m?: string) {
        super();
        this.message = m || "A required feature has not been enabled";
    }
}

export class ResourceAllocationFailure extends ScoutError {
    public readonly code: number = ErrorCode.ResourceAllocationFailure;

    constructor(m?: string) {
        super();
        this.message = m || "Failed to allocate critical resource";
    }
}

export class ResourceAllocationFailureLimitExceeded extends ScoutError {
    public readonly code: number = ErrorCode.ResourceAllocationFailureLimitExceeded;

    constructor(m?: string) {
        super();
        this.message = m || "Resource allocation failures exceeded threshhold";
    }
}

export class NotSupported extends ScoutError {
    public readonly code: number = ErrorCode.NotSupported;

    constructor(m?: string) {
        super();
        this.message = m || "Not supported";
    }
}
