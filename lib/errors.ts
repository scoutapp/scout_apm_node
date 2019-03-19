export enum ErrorCode {
    NotImplemented,
    InvalidVersion,
    UnsupportedVersion,
    UnexpectedError,
    InvalidAgentDownloadConfig,
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
