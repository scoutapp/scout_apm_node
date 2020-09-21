"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const semver_1 = require("semver");
const buffer_1 = require("buffer");
const errors_1 = require("../errors");
const Constants = require("../constants");
class BaseAgentRequest {
    /**
     * Convert the message to the binary type that is readable by core-agent
     *
     * @returns {Buffer} the buffer of bytes
     */
    toBinary() {
        const content = JSON.stringify(this.json);
        const payload = buffer_1.Buffer.from(content, "utf8");
        const length = buffer_1.Buffer.allocUnsafe(4);
        length.writeUInt32BE(payload.length, 0);
        return buffer_1.Buffer.concat([length, payload]);
    }
    /**
     * Get a request ID
     * @returns {string | null} Request ID if the request has one
     */
    getRequestId() {
        return null;
    }
}
exports.BaseAgentRequest = BaseAgentRequest;
function isSuccessfulResponseResult(obj) {
    return obj && typeof obj === "string" && obj === "Success";
}
class BaseAgentResponse {
    /**
     * Check whether some JSON value matches the structure for a given agent response
     *
     * @param json: any
     * @returns {boolean} whether the JSON matches the response or not
     */
    matchesJson(json) {
        return false;
    }
    /**
     * Get a request ID
     * @returns {string | null} Request ID if the request has one
     */
    getRequestId() {
        return null;
    }
    /**
     * Check whether a response was successful
     * @return {boolean} whether the response was successful
     */
    succeeded() {
        return isSuccessfulResponseResult(this.result);
    }
}
exports.BaseAgentResponse = BaseAgentResponse;
class CoreAgentVersion {
    constructor(v) {
        const converted = semver_1.valid(v);
        if (!converted) {
            throw new errors_1.InvalidVersion(`Invalid version [${v}]`);
        }
        this.raw = converted;
    }
}
exports.CoreAgentVersion = CoreAgentVersion;
/**
 * Options for agents that are in a separate process not managed by this one
 */
class ProcessOptions {
    constructor(binPath, uri, opts) {
        // Amount of time to wait before timing out messages
        this.sendTimeoutMs = Constants.DEFAULT_AGENT_SEND_TIMEOUT_MS;
        // Amount of time to wait before timing out existing sockets
        this.socketTimeoutMs = Constants.DEFAULT_SOCKET_TIMEOUT_MS;
        // Customize conection pool
        this.connPoolOpts = Constants.DEFAULT_CONNECTION_POOL_OPTS;
        this.binPath = binPath;
        this.uri = uri;
        if (opts) {
            if (opts.logLevel) {
                this.logLevel = opts.logLevel;
            }
            if (opts.logFilePath) {
                this.logFilePath = opts.logFilePath;
            }
            if (opts.configFilePath) {
                this.configFilePath = opts.configFilePath;
            }
            if (opts.connPoolOpts) {
                this.connPoolOpts = opts.connPoolOpts;
            }
            if (opts.disallowLaunch) {
                this.disallowLaunch = opts.disallowLaunch;
            }
            if (opts.sendTimeoutMs) {
                this.sendTimeoutMs = opts.sendTimeoutMs;
            }
            if (opts.socketTimeoutMs) {
                this.socketTimeoutMs = opts.socketTimeoutMs;
            }
        }
    }
    /**
     * Check if some object is a valid ProcessOptions object
     *
     * @param {any} obj
     * @returns {boolean} whether the object is a valid ProcessOptions
     */
    static isValid(obj) {
        return obj
            && "binPath" in obj && typeof obj.binPath === "string"
            && "uri" in obj && typeof obj.uri === "string"
            && "isDomainSocket" in obj && typeof obj.isDomainSocket === "function";
    }
    /**
     * Returns whether the address represents a domain socket
     *
     * @returns {boolean} whether the address is a domain socket
     */
    isDomainSocket() {
        return Constants.DOMAIN_SOCKET_URI_SCHEME_RGX.test(this.uri);
    }
}
exports.ProcessOptions = ProcessOptions;
