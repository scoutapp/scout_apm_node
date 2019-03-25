import { v1 as uuidv1 } from "uuid";

import * as Constants from "../../constants";
import * as Errors from "../../errors";
import { AgentRequest, AgentRequestType, CoreAgentVersion, JSONValue } from "../../types";

export class V1GetVersionRequest extends AgentRequest {
    public readonly type: AgentRequestType = AgentRequestType.V1GetVersion;

    constructor() {
        super();
        this.json = {CoreAgentVersion: {}};
    }
}

export class V1Register extends AgentRequest {
    public readonly type: AgentRequestType = AgentRequestType.V1StartRequest;

    constructor(app: string, key: string, version: CoreAgentVersion) {
        super();
        this.json = {
            Register: {
                api_version: version.raw,
                app,
                key,
            },
        };
    }
}

export class V1StartRequest extends AgentRequest {
    public readonly type: AgentRequestType = AgentRequestType.V1StartRequest;

    public readonly requestId: string;

    constructor(opts?: {requestId?: string, timestamp?: Date}) {
        super();
        const id = opts && opts.requestId ? opts.requestId : uuidv1();
        const prefix = Constants.DEFAULT_REQUEST_PREFIX;
        this.requestId = `${prefix}${id}`;

        const timestamp = opts && opts.timestamp ? opts.timestamp : undefined;

        this.json = {
            StartRequest: {
                request_id: this.requestId,
                timestamp,
            },
        };
    }
}

export class V1FinishRequest extends AgentRequest {
    public readonly type: AgentRequestType = AgentRequestType.V1FinishRequest;

    public readonly requestId: string;

    constructor(requestId: string, opts?: {timestamp?: Date}) {
        super();
        this.requestId = requestId;
        const timestamp = opts && opts.timestamp ? opts.timestamp : undefined;

        this.json = {
            FinishRequest: {
                request_id: this.requestId,
                timestamp,
            },
        };
    }
}

export class V1TagRequest extends AgentRequest {
    public readonly type: AgentRequestType = AgentRequestType.V1TagRequest;

    public readonly requestId: string;

    constructor(
        requestId: string,
        tagName: string,
        tagValue: string,
        opts?: {timestamp?: Date},
    ) {
        super();
        this.requestId = requestId;
        const timestamp = opts && opts.timestamp ? opts.timestamp : undefined;

        this.json = {
            TagRequest: {
                request_id: this.requestId,
                tag: tagName,
                timestamp,
                value: tagValue,
            },
        };
    }
}

export class V1StartSpan extends AgentRequest {
    public readonly type: AgentRequestType = AgentRequestType.V1StartSpan;

    public readonly requestId: string;
    public readonly spanId: string;
    public readonly operation: string;
    public readonly parentId?: string;

    constructor(
        operation: string,
        requestId: string,
        opts?: {
            spanId?: string,
            parentId?: string,
            timestamp?: Date,
        },
    ) {
        super();
        this.requestId = requestId;
        this.operation = operation;
        this.parentId = opts && opts.parentId ? opts.parentId : undefined;

        const id = opts && opts.spanId ? opts.spanId : uuidv1();
        const prefix = Constants.DEFAULT_SPAN_PREFIX;
        this.spanId = `${prefix}${id}`;

        const timestamp = opts && opts.timestamp ? opts.timestamp : undefined;

        this.json = {
            StartSpan: {
                operation,
                parent_id: this.parentId,
                request_id: this.requestId,
                span_id: this.spanId,
                timestamp,
            },
        };
    }
}

export class V1StopSpan extends AgentRequest {
    public readonly type: AgentRequestType = AgentRequestType.V1StopSpan;

    public readonly requestId: string;
    public readonly spanId: string;

    constructor(
        spanId: string,
        requestId: string,
        opts?: {
            timestamp?: Date,
        },
    ) {
        super();
        this.requestId = requestId;
        this.spanId = spanId;
        const timestamp = opts && opts.timestamp ? opts.timestamp : undefined;

        this.json = {
            StopSpan: {
                request_id: this.requestId,
                span_id: this.spanId,
                timestamp,
            },
        };
    }
}

export class V1TagSpan extends AgentRequest {
    public readonly type: AgentRequestType = AgentRequestType.V1TagSpan;

    public readonly requestId: string;
    public readonly spanId: string;
    public readonly tagName: string;
    public readonly tagValue: JSONValue | JSONValue[];

    constructor(
        tagName: string,
        tagValue: JSONValue | JSONValue[],
        spanId: string,
        requestId: string,
        opts?: {
            timestamp?: Date,
        },
    ) {
        super();
        this.requestId = requestId;
        this.spanId = spanId;
        this.tagName = tagName;
        this.tagValue = tagValue;

        const timestamp = opts && opts.timestamp ? opts.timestamp : undefined;

        this.json = {
            TagSpan: {
                request_id: this.requestId,
                span_id: this.spanId,
                tag: this.tagName,
                timestamp,
                value: JSON.stringify(this.tagValue),
            },
        };
    }
}
