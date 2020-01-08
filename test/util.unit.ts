import * as test from "tape";
import { Test } from "tape";

import {
    splitAgentResponses,
    scrubRequestPathParams,
    scrubRequestPath,
} from "../lib/types";

import { buildCoreAgentSocketResponse } from "./util";
import * as Constants from "../lib/constants";
import * as TestFixtures from "./fixtures";

// test("splitAgentResponse parses well formed headers", t => {
//     // Build a buffer with a message
//     const buf = buildCoreAgentSocketResponse(TestFixtures.RESPONSES.V1.REGISTER.COMPLETE);

//     const result = splitAgentResponses(buf);

//     t.assert(result, "result was returned");
//     t.equals(result.framed.length, 1, "exactly one framed message was returned");
//     t.equals(result.remaining.length, 0, "no leftover bytes");

//     t.end();
// });

// test("splitAgentResponse parses partial response", t => {
//     // Build a buffer with a partial message, but write the length to be the complete message
//     const buf = buildCoreAgentSocketResponse(TestFixtures.RESPONSES.V1.REGISTER.PARTIAL);
//     buf.writeUInt32BE(TestFixtures.RESPONSES.V1.REGISTER.COMPLETE.length, 0);

//     const result = splitAgentResponses(buf);

//     t.assert(result, "result was returned");
//     t.equals(result.framed.length, 0, "no framed full message was returned");
//     t.equals(
//         result.remaining.length,
//         TestFixtures.RESPONSES.V1.REGISTER.PARTIAL.length + 4,
//         "remaining (badly-framed) bytes are partial length + 4 byte amount",
//     );

//     t.end();
// });

// test("splitAgentResponse parses multiple responses", t => {
//     // Build a buffer with a message
//     const buf = Buffer.concat([
//         buildCoreAgentSocketResponse(TestFixtures.RESPONSES.V1.REGISTER.COMPLETE),
//         buildCoreAgentSocketResponse(TestFixtures.RESPONSES.V1.REGISTER.COMPLETE),
//     ]);

//     const result = splitAgentResponses(buf);

//     t.assert(result, "result was returned");
//     t.equals(result.framed.length, 2, "exactly two framed message was returned");
//     t.equals(result.remaining.length, 0, "no leftover bytes");

//     t.end();
// });

test("scrubURLParams scrubs params properly", t => {
    // Build a buffer with a message
    const scrubbed: string = scrubRequestPathParams("https://localhost/some/path?password=test");

    t.assert(
        scrubbed.includes(`password=${Constants.DEFAULT_PARAM_SCRUB_REPLACEMENT}`),
        "scrubbed string has password replaced",
    );

    t.end();
});

test("scrubURLToPath scrubs URL down to path", t => {
    // Build a buffer with a message
    const scrubbed: string = scrubRequestPath("https://localhost/some/path?password=test");

    t.equals(scrubbed, "https://localhost/some/path");

    t.end();
});
