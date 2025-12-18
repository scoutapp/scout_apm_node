"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tape_1 = __importDefault(require("tape"));
const types_1 = require("../lib/types");
const util_1 = require("./util");
const Constants = __importStar(require("../lib/constants"));
const TestFixtures = __importStar(require("./fixtures"));
(0, tape_1.default)("splitAgentResponse parses well formed headers", t => {
    // Build a buffer with a message
    const buf = (0, util_1.buildCoreAgentSocketResponse)(TestFixtures.RESPONSES.V1.REGISTER.COMPLETE);
    const result = (0, types_1.splitAgentResponses)(buf);
    t.assert(result, "result was returned");
    t.equals(result.framed.length, 1, "exactly one framed message was returned");
    t.equals(result.remaining.length, 0, "no leftover bytes");
    t.end();
});
(0, tape_1.default)("splitAgentResponse parses partial response", t => {
    // Build a buffer with a partial message, but write the length to be the complete message
    const buf = (0, util_1.buildCoreAgentSocketResponse)(TestFixtures.RESPONSES.V1.REGISTER.PARTIAL);
    buf.writeUInt32BE(TestFixtures.RESPONSES.V1.REGISTER.COMPLETE.length, 0);
    const result = (0, types_1.splitAgentResponses)(buf);
    t.assert(result, "result was returned");
    t.equals(result.framed.length, 0, "no framed full message was returned");
    t.equals(result.remaining.length, TestFixtures.RESPONSES.V1.REGISTER.PARTIAL.length + 4, "remaining (badly-framed) bytes are partial length + 4 byte amount");
    t.end();
});
(0, tape_1.default)("splitAgentResponse parses multiple responses", t => {
    // Build a buffer with a message
    const buf = Buffer.concat([
        (0, util_1.buildCoreAgentSocketResponse)(TestFixtures.RESPONSES.V1.REGISTER.COMPLETE),
        (0, util_1.buildCoreAgentSocketResponse)(TestFixtures.RESPONSES.V1.REGISTER.COMPLETE),
    ]);
    const result = (0, types_1.splitAgentResponses)(buf);
    t.assert(result, "result was returned");
    t.equals(result.framed.length, 2, "exactly two framed message was returned");
    t.equals(result.remaining.length, 0, "no leftover bytes");
    t.end();
});
(0, tape_1.default)("scrubURLParams scrubs params properly", t => {
    // Build a buffer with a message
    const scrubbed = (0, types_1.scrubRequestPathParams)("https://localhost/some/path?password=test");
    t.assert(scrubbed.includes(`password=${Constants.DEFAULT_PARAM_SCRUB_REPLACEMENT}`), "scrubbed string has password replaced");
    t.end();
});
(0, tape_1.default)("scrubURLToPath scrubs URL down to path", t => {
    // Build a buffer with a message
    const scrubbed = (0, types_1.scrubRequestPath)("https://localhost/some/path?password=test");
    t.equals(scrubbed, "https://localhost/some/path");
    t.end();
});
