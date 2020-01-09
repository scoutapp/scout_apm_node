"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const types_1 = require("../lib/types");
const util_1 = require("./util");
const TestFixtures = require("./fixtures");
test("splitAgentResponse parses well formed headers", t => {
    // Build a buffer with a message
    const buf = util_1.buildCoreAgentSocketResponse(TestFixtures.RESPONSES.V1.REGISTER.COMPLETE);
    const result = types_1.splitAgentResponses(buf);
    t.assert(result, "result was returned");
    t.equals(result.framed.length, 1, "exactly one framed message was returned");
    t.equals(result.remaining.length, 0, "no leftover bytes");
    t.end();
});
test("splitAgentResponse parses partial response", t => {
    // Build a buffer with a partial message, but write the length to be the complete message
    const buf = util_1.buildCoreAgentSocketResponse(TestFixtures.RESPONSES.V1.REGISTER.PARTIAL);
    buf.writeUInt32BE(TestFixtures.RESPONSES.V1.REGISTER.COMPLETE.length, 0);
    const result = types_1.splitAgentResponses(buf);
    t.assert(result, "result was returned");
    t.equals(result.framed.length, 0, "no framed full message was returned");
    t.equals(result.remaining.length, TestFixtures.RESPONSES.V1.REGISTER.PARTIAL.length + 4, "remaining (badly-framed) bytes are partial length + 4 byte amount");
    t.end();
});
test("splitAgentResponse parses multiple responses", t => {
    // Build a buffer with a message
    const buf = Buffer.concat([
        util_1.buildCoreAgentSocketResponse(TestFixtures.RESPONSES.V1.REGISTER.COMPLETE),
        util_1.buildCoreAgentSocketResponse(TestFixtures.RESPONSES.V1.REGISTER.COMPLETE),
    ]);
    const result = types_1.splitAgentResponses(buf);
    t.assert(result, "result was returned");
    t.equals(result.framed.length, 2, "exactly two framed message was returned");
    t.equals(result.remaining.length, 0, "no leftover bytes");
    t.end();
});
