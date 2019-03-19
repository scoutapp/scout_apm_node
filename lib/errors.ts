export enum ErrorCode {
    NotImplemented,
    InvalidVersion,
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
