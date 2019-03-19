export enum ErrorCode {
    NotImplemented,
    InvalidVersion,
}

class ScoutError extends Error {
    public readonly code: number;
}

export class NotImplemented extends ScoutError {
    constructor(m?: string) {
        super();
        this.message = m || "Not implemented";
        this.code = ErrorCode.NotImplemented;
    }
}

export class InvalidVersion extends ScoutError {
    constructor(m?: string) {
        super();
        this.message = m || "Invalid version specified";
        this.code = ErrorCode.InvalidVersion;
    }
}
