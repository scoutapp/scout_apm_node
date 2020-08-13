"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnknownResponse = exports.V1FailureResponse = exports.V1ApplicationEventResponse = exports.V1TagSpanResponse = exports.V1StopSpanResponse = exports.V1StartSpanResponse = exports.V1TagRequestResponse = exports.V1FinishRequestResponse = exports.V1StartRequestResponse = exports.V1RegisterResponse = exports.V1GetVersionResponse = exports.V1AgentResponse = void 0;
const Errors = require("../../errors");
const types_1 = require("../../types");
// TODO: make this more efficient (hash lookup) if it's the case
// that version checking is just looking for key in outer object of response
const RTAC_LOOKUP = [
    [
        obj => "CoreAgentVersion" in obj,
        { type: types_1.AgentResponseType.V1GetVersion, ctor: (obj) => new V1GetVersionResponse(obj) },
    ],
    [
        obj => "Register" in obj,
        { type: types_1.AgentResponseType.V1Register, ctor: (obj) => new V1RegisterResponse(obj) },
    ],
    [
        obj => "StartRequest" in obj,
        { type: types_1.AgentResponseType.V1StartRequest, ctor: (obj) => new V1StartRequestResponse(obj) },
    ],
    [
        obj => "FinishRequest" in obj,
        { type: types_1.AgentResponseType.V1FinishRequest, ctor: (obj) => new V1FinishRequestResponse(obj) },
    ],
    [
        obj => "TagRequest" in obj,
        { type: types_1.AgentResponseType.V1TagRequest, ctor: (obj) => new V1TagRequestResponse(obj) },
    ],
    [
        obj => "StartSpan" in obj,
        { type: types_1.AgentResponseType.V1StartSpan, ctor: (obj) => new V1StartSpanResponse(obj) },
    ],
    [
        obj => "StopSpan" in obj,
        { type: types_1.AgentResponseType.V1StopSpan, ctor: (obj) => new V1StopSpanResponse(obj) },
    ],
    [
        obj => "TagSpan" in obj,
        { type: types_1.AgentResponseType.V1TagSpan, ctor: (obj) => new V1TagSpanResponse(obj) },
    ],
    [
        obj => "ApplicationEvent" in obj,
        { type: types_1.AgentResponseType.V1ApplicationEvent, ctor: (obj) => new V1ApplicationEventResponse(obj) },
    ],
    [
        obj => "Failure" in obj,
        { type: types_1.AgentResponseType.V1Failure, ctor: (obj) => new V1FailureResponse(obj) },
    ],
];
function getResponseTypeAndConstrutor(obj) {
    const rwc = RTAC_LOOKUP.find((rwc) => rwc[0](obj));
    if (rwc && rwc[1]) {
        return rwc[1];
    }
    return { type: types_1.AgentResponseType.Unknown, ctor: (obj) => new UnknownResponse(obj) };
}
class V1AgentResponse extends types_1.BaseAgentResponse {
    /** @see AgentResponse */
    static fromBinary(buf) {
        return new Promise((resolve, reject) => {
            // Expect 4 byte content length, then JSON message
            if (buf.length < 5) {
                return Promise.reject(new Errors.MalformedAgentResponse(`Unexpected buffer length [${buf.length}]`));
            }
            // Pull and check the payload length
            const payloadLen = buf.readUInt32BE(0);
            const expected = buf.length - 4;
            if (expected !== payloadLen) {
                return Promise.reject(new Errors.MalformedAgentResponse(`Invalid Content length: (expected ${expected}, received ${payloadLen})\n Buffer: [${buf}]`));
            }
            // Extract & parse JSON
            const json = buf.toString("utf8", 4, buf.length);
            const obj = JSON.parse(json);
            // Detect response type
            const { type: responseType, ctor } = getResponseTypeAndConstrutor(obj);
            if (responseType === types_1.AgentResponseType.Unknown) {
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
exports.V1AgentResponse = V1AgentResponse;
class V1GetVersionResponse extends V1AgentResponse {
    constructor(obj) {
        super();
        this.type = types_1.AgentResponseType.V1GetVersion;
        if (!("CoreAgentVersion" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1GetVersionResponse, 'CoreAgentVersion' key missing");
        }
        const inner = obj.CoreAgentVersion;
        this.version = new types_1.CoreAgentVersion(inner.version);
        if ("result" in inner) {
            this.result = inner.result;
        }
    }
}
exports.V1GetVersionResponse = V1GetVersionResponse;
class V1RegisterResponse extends V1AgentResponse {
    constructor(obj) {
        super();
        this.type = types_1.AgentResponseType.V1Register;
        if (!("Register" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1RegisterResponse, 'Register' key missing");
        }
        const inner = obj.Register;
        if ("result" in inner) {
            this.result = inner.result;
        }
    }
}
exports.V1RegisterResponse = V1RegisterResponse;
class V1StartRequestResponse extends V1AgentResponse {
    constructor(obj) {
        super();
        this.type = types_1.AgentResponseType.V1StartRequest;
        if (!("StartRequest" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1StartRequestResponse, 'StartRequest' key missing");
        }
        const inner = obj.StartRequest;
        if ("result" in inner) {
            this.result = inner.result;
        }
    }
}
exports.V1StartRequestResponse = V1StartRequestResponse;
class V1FinishRequestResponse extends V1AgentResponse {
    constructor(obj) {
        super();
        this.type = types_1.AgentResponseType.V1FinishRequest;
        if (!("FinishRequest" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1FinishRequestResponse, 'FinishRequest' key missing");
        }
        const inner = obj.FinishRequest;
        if ("result" in inner) {
            this.result = inner.result;
        }
    }
}
exports.V1FinishRequestResponse = V1FinishRequestResponse;
class V1TagRequestResponse extends V1AgentResponse {
    constructor(obj) {
        super();
        this.type = types_1.AgentResponseType.V1TagRequest;
        if (!("TagRequest" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1TagRequestResponse, 'TagRequest' key missing");
        }
        const inner = obj.TagRequest;
        if ("result" in inner) {
            this.result = inner.result;
        }
    }
}
exports.V1TagRequestResponse = V1TagRequestResponse;
class V1StartSpanResponse extends V1AgentResponse {
    constructor(obj) {
        super();
        this.type = types_1.AgentResponseType.V1StartSpan;
        if (!("StartSpan" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1StartSpanResponse, 'StartSpan' key missing");
        }
        const inner = obj.StartSpan;
        if ("result" in inner) {
            this.result = inner.result;
        }
    }
}
exports.V1StartSpanResponse = V1StartSpanResponse;
class V1StopSpanResponse extends V1AgentResponse {
    constructor(obj) {
        super();
        this.type = types_1.AgentResponseType.V1StopSpan;
        if (!("StopSpan" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1StopSpanResponse, 'StopSpan' key missing");
        }
        const inner = obj.StopSpan;
        if ("result" in inner) {
            this.result = inner.result;
        }
    }
}
exports.V1StopSpanResponse = V1StopSpanResponse;
class V1TagSpanResponse extends V1AgentResponse {
    constructor(obj) {
        super();
        this.type = types_1.AgentResponseType.V1TagSpan;
        if (!("TagSpan" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1TagSpanResponse, 'TagSpan' key missing");
        }
        const inner = obj.TagSpan;
        if ("result" in inner) {
            this.result = inner.result;
        }
    }
}
exports.V1TagSpanResponse = V1TagSpanResponse;
class V1ApplicationEventResponse extends V1AgentResponse {
    constructor(obj) {
        super();
        this.type = types_1.AgentResponseType.V1ApplicationEvent;
        if (!("ApplicationEvent" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1ApplicationEventResponse, 'ApplicationEvent' key missing");
        }
        const inner = obj.ApplicationEvent;
        if ("result" in inner) {
            this.result = inner.result;
        }
    }
}
exports.V1ApplicationEventResponse = V1ApplicationEventResponse;
class V1FailureResponse extends V1AgentResponse {
    constructor(obj) {
        super();
        this.type = types_1.AgentResponseType.V1Failure;
        if (!("Failure" in obj)) {
            throw new Errors.UnexpectedError("Invalid V1FailureResponse, 'Failure' key missing");
        }
        const inner = obj.Failure;
        if ("message" in inner) {
            this.message = inner.message;
        }
    }
}
exports.V1FailureResponse = V1FailureResponse;
class UnknownResponse extends V1AgentResponse {
    constructor(obj) {
        super();
        this.type = types_1.AgentResponseType.Unknown;
        this.raw = obj;
    }
}
exports.UnknownResponse = UnknownResponse;
