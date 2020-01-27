/// <reference types="node" />
import { BaseAgentResponse, AgentResponseType, CoreAgentVersion } from "../../types";
export declare class V1AgentResponse extends BaseAgentResponse {
    /** @see AgentResponse */
    static fromBinary<T extends BaseAgentResponse>(buf: Buffer): Promise<BaseAgentResponse>;
}
export declare class V1GetVersionResponse extends V1AgentResponse {
    readonly type: AgentResponseType;
    readonly version: CoreAgentVersion;
    constructor(obj: any);
}
export declare class V1RegisterResponse extends V1AgentResponse {
    readonly type: AgentResponseType;
    constructor(obj: any);
}
export declare class V1StartRequestResponse extends V1AgentResponse {
    readonly type: AgentResponseType;
    constructor(obj: any);
}
export declare class V1FinishRequestResponse extends V1AgentResponse {
    readonly type: AgentResponseType;
    constructor(obj: any);
}
export declare class V1TagRequestResponse extends V1AgentResponse {
    readonly type: AgentResponseType;
    constructor(obj: any);
}
export declare class V1StartSpanResponse extends V1AgentResponse {
    readonly type: AgentResponseType;
    constructor(obj: any);
}
export declare class V1StopSpanResponse extends V1AgentResponse {
    readonly type: AgentResponseType;
    constructor(obj: any);
}
export declare class V1TagSpanResponse extends V1AgentResponse {
    readonly type: AgentResponseType;
    constructor(obj: any);
}
export declare class V1ApplicationEventResponse extends V1AgentResponse {
    readonly type: AgentResponseType;
    constructor(obj: any);
}
export declare class V1FailureResponse extends V1AgentResponse {
    readonly type: AgentResponseType;
    readonly message: string;
    constructor(obj: any);
}
export declare class UnknownResponse extends V1AgentResponse {
    readonly type: AgentResponseType;
    readonly raw: any;
    constructor(obj: any);
}
