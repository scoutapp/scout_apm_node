import * as Errors from "../../errors";
import { AgentResponse, AgentResponseType, CoreAgentVersion, JSONValue } from "../../types";

interface ResponseTypeAndCtor { // "RTAC"
    type: AgentResponseType;
    ctor?: (obj: object) => AgentResponse;
}

type RTACWithCheck = [
    (obj: object) => boolean,
    ResponseTypeAndCtor,
];

// TODO: make this more efficient (hash lookup) if it's the case
// that version checking is just looking for key in outer object of response
const RTAC_LOOKUP: RTACWithCheck[] = [
    [
        obj => "CoreAgentVersion" in obj,
        {type: AgentResponseType.V1GetVersion, ctor: (obj) => new V1GetVersionResponse(obj)},
    ],
    [
        obj => "Register" in obj,
        {type: AgentResponseType.V1Register, ctor: (obj) => new V1RegisterResponse(obj)},
    ],
    [
        obj => "StartRequest" in obj,
        {type: AgentResponseType.V1StartRequest, ctor: (obj) => new V1StartRequestResponse(obj)},
    ],
    [
        obj => "FinishRequest" in obj,
        {type: AgentResponseType.V1FinishRequest, ctor: (obj) => new V1FinishRequestResponse(obj)},
    ],
    [
        obj => "TagRequest" in obj,
        {type: AgentResponseType.V1TagRequest, ctor: (obj) => new V1TagRequestResponse(obj)},
    ],
    [
        obj => "StartSpan" in obj,
        {type: AgentResponseType.V1StartSpan, ctor: (obj) => new V1StartSpanResponse(obj)},
    ],
    [
        obj => "StopSpan" in obj,
        {type: AgentResponseType.V1StopSpan, ctor: (obj) => new V1StopSpanResponse(obj)},
    ],
    [
        obj => "TagSpan" in obj,
        {type: AgentResponseType.V1TagSpan, ctor: (obj) => new V1TagSpanResponse(obj)},
    ],
    [
        obj => "Failure" in obj,
        {type: AgentResponseType.V1Failure, ctor: (obj) => new V1FailureResponse(obj)},
    ],
];

function getResponseTypeAndConstrutor(obj: object): ResponseTypeAndCtor {
    const rwc: RTACWithCheck | undefined = RTAC_LOOKUP.find((rwc: RTACWithCheck) => rwc[0](obj));
    if (rwc && rwc[1]) { return rwc[1]; }

    return {type: AgentResponseType.Unknown, ctor: (obj) => new UnknownResponse(obj)};
}

export class V1AgentResponse extends AgentResponse {
    /** @see AgentResponse */
    public static fromBinary<T extends AgentResponse>(buf: Buffer): Promise<AgentResponse> {
        return new Promise((resolve, reject) => {
            // Expect 4 byte content length, then JSON message
            if (buf.length < 5) {
                return Promise.reject(new Errors.MalformedAgentResponse(`Unexpected buffer length [${buf.length}]`));
            }

            // Pull and check the payload length
            const payloadLen: number = buf.readUInt32BE(0);
            const expected = buf.length - 4;
            if (expected !== payloadLen) {
                return Promise.reject(new Errors.MalformedAgentResponse(
                    `Invalid Content length: (expected ${expected}, received ${payloadLen})`,
                ));
            }

            // Extract & parse JSON
            const json = buf.toString("utf8", 4, buf.length);
            const obj = JSON.parse(json);

            // Detect response type
            const {type: responseType, ctor} = getResponseTypeAndConstrutor(obj);
            if (responseType === AgentResponseType.Unknown) {
                reject(new Errors.UnrecognizedAgentResponse(`Raw JSON: ${json}`));
                return;
            }

            // Construct specialized response type
            if (!ctor) {
                reject(new Errors.UnexpectedError("Failed to construct response type"));
                return;
            }
            const response = ctor(obj);

            resolve(response);
        });
    }
}

export class V1GetVersionResponse extends V1AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.V1GetVersion;
    public readonly version: CoreAgentVersion;

    constructor(obj: any) {
        super();
        if (!("CoreAgentVersion" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1GetVersionResponse, 'CoreAgentVersion' key missing");
        }
        const inner = obj.CoreAgentVersion;

        this.version = new CoreAgentVersion(inner.version);
        if ("result" in inner) { this.result = inner.result; }
    }
}

export class V1RegisterResponse extends V1AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.V1Register;

    constructor(obj: any) {
        super();
        if (!("Register" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1RegisterResponse, 'Register' key missing");
        }
        const inner = obj.Register;
        if ("result" in inner) { this.result = inner.result; }
    }
}

export class V1StartRequestResponse extends V1AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.V1StartRequest;

    constructor(obj: any) {
        super();
        if (!("StartRequest" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1StartRequestResponse, 'StartRequest' key missing");
        }

        const inner = obj.StartRequest;
        if ("result" in inner) { this.result = inner.result; }
    }
}

export class V1FinishRequestResponse extends V1AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.V1FinishRequest;

    constructor(obj: any) {
        super();
        if (!("FinishRequest" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1FinishRequestResponse, 'FinishRequest' key missing");
        }

        const inner = obj.FinishRequest;
        if ("result" in inner) { this.result = inner.result; }
    }
}

export class V1TagRequestResponse extends V1AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.V1TagRequest;

    constructor(obj: any) {
        super();
        if (!("TagRequest" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1TagRequestResponse, 'TagRequest' key missing");
        }

        const inner = obj.TagRequest;
        if ("result" in inner) { this.result = inner.result; }
    }
}

export class V1StartSpanResponse extends V1AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.V1StartSpan;

    constructor(obj: any) {
        super();
        if (!("StartSpan" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1StartSpanResponse, 'StartSpan' key missing");
        }

        const inner = obj.StartSpan;
        if ("result" in inner) { this.result = inner.result; }
    }
}

export class V1StopSpanResponse extends V1AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.V1StopSpan;

    constructor(obj: any) {
        super();
        if (!("StopSpan" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1StopSpanResponse, 'StopSpan' key missing");
        }

        const inner = obj.StopSpan;
        if ("result" in inner) { this.result = inner.result; }
    }
}

export class V1TagSpanResponse extends V1AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.V1TagSpan;

    constructor(obj: any) {
        super();
        if (!("TagSpan" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1TagSpanResponse, 'TagSpan' key missing");
        }

        const inner = obj.TagSpan;
        if ("result" in inner) { this.result = inner.result; }
    }
}

export class V1FailureResponse extends V1AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.V1Failure;
    public readonly message: string;

    constructor(obj: any) {
        super();
        if (!("Failure" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1FailureResponse, 'Failure' key missing");
        }

        const inner = obj.Failure;
        if ("message" in inner) { this.message = inner.message; }
    }
}

export class UnknownResponse extends V1AgentResponse {
    public readonly type: AgentResponseType = AgentResponseType.Unknown;
    public readonly raw: any;

    constructor(obj: any) {
        super();
        this.raw = obj;
    }
}
