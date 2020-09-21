"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const Constants = require("../../constants");
const types_1 = require("../../types");
class V1GetVersionRequest extends types_1.BaseAgentRequest {
    constructor() {
        super();
        this.type = types_1.AgentRequestType.V1GetVersion;
        this.json = { CoreAgentVersion: {} };
    }
}
exports.V1GetVersionRequest = V1GetVersionRequest;
class V1Register extends types_1.BaseAgentRequest {
    constructor(app, key, version) {
        super();
        this.type = types_1.AgentRequestType.V1Register;
        this.json = {
            Register: {
                api_version: version,
                app,
                key,
            },
        };
    }
}
exports.V1Register = V1Register;
class V1StartRequest extends types_1.BaseAgentRequest {
    constructor(opts) {
        super();
        this.type = types_1.AgentRequestType.V1StartRequest;
        const prefix = Constants.DEFAULT_REQUEST_PREFIX;
        this.timestamp = opts && opts.timestamp ? opts.timestamp : new Date();
        this.requestId = opts && opts.requestId ? opts.requestId : `${prefix}${uuid_1.v4()}`;
        this.json = {
            StartRequest: {
                request_id: this.requestId,
                timestamp: this.timestamp,
            },
        };
    }
}
exports.V1StartRequest = V1StartRequest;
class V1FinishRequest extends types_1.BaseAgentRequest {
    constructor(requestId, opts) {
        super();
        this.type = types_1.AgentRequestType.V1FinishRequest;
        this.requestId = requestId;
        this.timestamp = opts && opts.timestamp ? opts.timestamp : new Date();
        this.json = {
            FinishRequest: {
                request_id: this.requestId,
                timestamp: this.timestamp,
            },
        };
    }
}
exports.V1FinishRequest = V1FinishRequest;
class V1TagRequest extends types_1.BaseAgentRequest {
    constructor(tagName, tagValue, requestId, opts) {
        super();
        this.type = types_1.AgentRequestType.V1TagRequest;
        this.requestId = requestId;
        this.timestamp = opts && opts.timestamp ? opts.timestamp : new Date();
        this.json = {
            TagRequest: {
                request_id: this.requestId,
                tag: tagName,
                timestamp: this.timestamp,
                value: tagValue,
            },
        };
    }
}
exports.V1TagRequest = V1TagRequest;
class V1StartSpan extends types_1.BaseAgentRequest {
    constructor(operation, requestId, opts) {
        super();
        this.type = types_1.AgentRequestType.V1StartSpan;
        this.requestId = requestId;
        this.operation = operation;
        this.parentId = opts && opts.parentId ? opts.parentId : undefined;
        const prefix = Constants.DEFAULT_SPAN_PREFIX;
        this.spanId = opts && opts.spanId ? opts.spanId : `${prefix}${uuid_1.v4()}`;
        this.timestamp = opts && opts.timestamp ? opts.timestamp : new Date();
        this.json = {
            StartSpan: {
                operation,
                parent_id: this.parentId,
                request_id: this.requestId,
                span_id: this.spanId,
                timestamp: this.timestamp,
            },
        };
    }
}
exports.V1StartSpan = V1StartSpan;
class V1StopSpan extends types_1.BaseAgentRequest {
    constructor(spanId, requestId, opts) {
        super();
        this.type = types_1.AgentRequestType.V1StopSpan;
        this.requestId = requestId;
        this.spanId = spanId;
        this.timestamp = opts && opts.timestamp ? opts.timestamp : new Date();
        this.json = {
            StopSpan: {
                request_id: this.requestId,
                span_id: this.spanId,
                timestamp: this.timestamp,
            },
        };
    }
}
exports.V1StopSpan = V1StopSpan;
class V1TagSpan extends types_1.BaseAgentRequest {
    constructor(tagName, tagValue, spanId, requestId, opts) {
        super();
        this.type = types_1.AgentRequestType.V1TagSpan;
        this.requestId = requestId;
        this.spanId = spanId;
        this.tagName = tagName;
        this.tagValue = tagValue;
        this.timestamp = opts && opts.timestamp ? opts.timestamp : new Date();
        this.json = {
            TagSpan: {
                request_id: this.requestId,
                span_id: this.spanId,
                tag: this.tagName,
                timestamp: this.timestamp,
                value: this.tagValue,
            },
        };
    }
}
exports.V1TagSpan = V1TagSpan;
class V1ApplicationEvent extends types_1.BaseAgentRequest {
    constructor(source, eventType, eventValue, opts) {
        super();
        this.type = types_1.AgentRequestType.V1ApplicationEvent;
        this.source = source;
        this.eventType = eventType;
        this.eventValue = eventValue;
        this.timestamp = opts && opts.timestamp ? opts.timestamp : new Date();
        this.json = {
            ApplicationEvent: {
                event_type: this.eventType,
                event_value: this.eventValue,
                source,
                timestamp: this.timestamp,
            },
        };
    }
}
exports.V1ApplicationEvent = V1ApplicationEvent;
