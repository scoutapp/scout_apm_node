"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var promise_timeout_1 = require("promise-timeout");
exports.TimeoutError = promise_timeout_1.TimeoutError;
var ErrorCode;
(function (ErrorCode) {
    ErrorCode[ErrorCode["NotImplemented"] = 0] = "NotImplemented";
    ErrorCode[ErrorCode["InvalidVersion"] = 1] = "InvalidVersion";
    ErrorCode[ErrorCode["UnsupportedVersion"] = 2] = "UnsupportedVersion";
    ErrorCode[ErrorCode["UnexpectedError"] = 3] = "UnexpectedError";
    ErrorCode[ErrorCode["InvalidAgentDownloadConfig"] = 4] = "InvalidAgentDownloadConfig";
    ErrorCode[ErrorCode["NoProcessReference"] = 5] = "NoProcessReference";
    ErrorCode[ErrorCode["Disconnected"] = 6] = "Disconnected";
    ErrorCode[ErrorCode["MalformedAgentResponse"] = 7] = "MalformedAgentResponse";
    ErrorCode[ErrorCode["UnrecognizedAgentResponse"] = 8] = "UnrecognizedAgentResponse";
    ErrorCode[ErrorCode["ExternalDownloadDisallowed"] = 9] = "ExternalDownloadDisallowed";
    ErrorCode[ErrorCode["RequestDoesNotPromptResponse"] = 10] = "RequestDoesNotPromptResponse";
    ErrorCode[ErrorCode["MissingRequiredFeature"] = 11] = "MissingRequiredFeature";
    ErrorCode[ErrorCode["ResourceAllocationFailure"] = 12] = "ResourceAllocationFailure";
    ErrorCode[ErrorCode["ResourceAllocationFailureLimitExceeded"] = 13] = "ResourceAllocationFailureLimitExceeded";
    ErrorCode[ErrorCode["NotSupported"] = 14] = "NotSupported";
    ErrorCode[ErrorCode["FinishedRequest"] = 15] = "FinishedRequest";
    ErrorCode[ErrorCode["ConnectionPoolDisabled"] = 16] = "ConnectionPoolDisabled";
    ErrorCode[ErrorCode["AgentLaunchDisabled"] = 17] = "AgentLaunchDisabled";
    ErrorCode[ErrorCode["MonitoringDisabled"] = 18] = "MonitoringDisabled";
    ErrorCode[ErrorCode["NoAgentPresent"] = 19] = "NoAgentPresent";
    ErrorCode[ErrorCode["NoActiveRequest"] = 20] = "NoActiveRequest";
})(ErrorCode = exports.ErrorCode || (exports.ErrorCode = {}));
class ScoutError extends Error {
}
class NotImplemented extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.NotImplemented;
        this.message = m || "Not implemented";
    }
}
exports.NotImplemented = NotImplemented;
class InvalidVersion extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.InvalidVersion;
        this.message = m || "Invalid version specified";
    }
}
exports.InvalidVersion = InvalidVersion;
class UnsupportedVersion extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.UnsupportedVersion;
        this.message = m || "Unsupported version specified";
    }
}
exports.UnsupportedVersion = UnsupportedVersion;
class UnexpectedError extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.UnexpectedError;
        this.message = m || "Unexpected error";
    }
}
exports.UnexpectedError = UnexpectedError;
class InvalidAgentDownloadConfig extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.InvalidAgentDownloadConfig;
        this.message = m || "Invalid agent download configuration";
    }
}
exports.InvalidAgentDownloadConfig = InvalidAgentDownloadConfig;
class NoProcessReference extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.NoProcessReference;
        this.message = m || "No process reference present (core-agent was not spawned by this process)";
    }
}
exports.NoProcessReference = NoProcessReference;
class Disconnected extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.Disconnected;
        this.message = m || "Agent is disconnected";
    }
}
exports.Disconnected = Disconnected;
class MalformedAgentResponse extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.MalformedAgentResponse;
        this.message = m || "Agent is disconnected";
    }
}
exports.MalformedAgentResponse = MalformedAgentResponse;
class UnrecognizedAgentResponse extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.UnrecognizedAgentResponse;
        this.message = m || "Agent is disconnected";
    }
}
exports.UnrecognizedAgentResponse = UnrecognizedAgentResponse;
class ExternalDownloadDisallowed extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.ExternalDownloadDisallowed;
        this.message = m || "External downloads disallowed";
    }
}
exports.ExternalDownloadDisallowed = ExternalDownloadDisallowed;
class RequestDoesNotPromptResponse extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.RequestDoesNotPromptResponse;
        this.message = m || "The given request does not prompt a response";
    }
}
exports.RequestDoesNotPromptResponse = RequestDoesNotPromptResponse;
class MissingRequiredFeature extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.MissingRequiredFeature;
        this.message = m || "A required feature has not been enabled";
    }
}
exports.MissingRequiredFeature = MissingRequiredFeature;
class ResourceAllocationFailure extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.ResourceAllocationFailure;
        this.message = m || "Failed to allocate critical resource";
    }
}
exports.ResourceAllocationFailure = ResourceAllocationFailure;
class ResourceAllocationFailureLimitExceeded extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.ResourceAllocationFailureLimitExceeded;
        this.message = m || "Resource allocation failures exceeded threshhold";
    }
}
exports.ResourceAllocationFailureLimitExceeded = ResourceAllocationFailureLimitExceeded;
class NotSupported extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.NotSupported;
        this.message = m || "Not supported";
    }
}
exports.NotSupported = NotSupported;
class FinishedRequest extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.FinishedRequest;
        this.message = m || "Operation cannot be performed because the request is finished";
    }
}
exports.FinishedRequest = FinishedRequest;
class ConnectionPoolDisabled extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.ConnectionPoolDisabled;
        this.message = m || "The connection pool has been disabled (likely from too many connection failures)";
    }
}
exports.ConnectionPoolDisabled = ConnectionPoolDisabled;
class AgentLaunchDisabled extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.AgentLaunchDisabled;
        this.message = m || "Agent launching has been disabled";
    }
}
exports.AgentLaunchDisabled = AgentLaunchDisabled;
class MonitoringDisabled extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.MonitoringDisabled;
        this.message = m || "Monitoring has been disabled";
    }
}
exports.MonitoringDisabled = MonitoringDisabled;
class NoAgentPresent extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.NoAgentPresent;
        this.message = m || "No agent is present";
    }
}
exports.NoAgentPresent = NoAgentPresent;
class NoActiveRequest extends ScoutError {
    constructor(m) {
        super();
        this.code = ErrorCode.NoActiveRequest;
        this.message = m || "No active request is curently underway";
    }
}
exports.NoActiveRequest = NoActiveRequest;
