import { BaseAgentRequest, AgentRequestType, APIVersion, JSONValue } from "../../types";
export declare class V1GetVersionRequest extends BaseAgentRequest {
    readonly type: AgentRequestType;
    constructor();
}
export declare class V1Register extends BaseAgentRequest {
    readonly type: AgentRequestType;
    constructor(app: string, key: string, version: APIVersion);
}
export declare class V1StartRequest extends BaseAgentRequest {
    readonly type: AgentRequestType;
    readonly requestId: string;
    readonly timestamp: Date;
    constructor(opts?: {
        requestId?: string;
        timestamp?: Date;
    });
}
export declare class V1FinishRequest extends BaseAgentRequest {
    readonly type: AgentRequestType;
    readonly requestId: string;
    readonly timestamp: Date;
    constructor(requestId: string, opts?: {
        timestamp?: Date;
    });
}
export declare class V1TagRequest extends BaseAgentRequest {
    readonly type: AgentRequestType;
    readonly requestId: string;
    readonly timestamp: Date;
    constructor(tagName: string, tagValue: JSONValue | JSONValue[], requestId: string, opts?: {
        timestamp?: Date;
    });
}
export declare class V1StartSpan extends BaseAgentRequest {
    readonly type: AgentRequestType;
    readonly requestId: string;
    readonly spanId: string;
    readonly timestamp: Date;
    readonly operation: string;
    readonly parentId?: string;
    constructor(operation: string, requestId: string, opts?: {
        spanId?: string;
        parentId?: string;
        timestamp?: Date;
    });
}
export declare class V1StopSpan extends BaseAgentRequest {
    readonly type: AgentRequestType;
    readonly requestId: string;
    readonly spanId: string;
    readonly timestamp: Date;
    constructor(spanId: string, requestId: string, opts?: {
        timestamp?: Date;
    });
}
export declare class V1TagSpan extends BaseAgentRequest {
    readonly type: AgentRequestType;
    readonly requestId: string;
    readonly spanId: string;
    readonly timestamp: Date;
    readonly tagName: string;
    readonly tagValue: JSONValue | JSONValue[];
    constructor(tagName: string, tagValue: JSONValue | JSONValue[], spanId: string, requestId: string, opts?: {
        timestamp?: Date;
    });
}
export declare class V1ApplicationEvent extends BaseAgentRequest {
    readonly type: AgentRequestType;
    readonly source: string;
    readonly eventType: string;
    readonly eventValue: JSONValue;
    readonly timestamp: Date;
    constructor(source: string, eventType: string, eventValue: JSONValue | JSONValue[], opts?: {
        timestamp?: Date;
    });
}
