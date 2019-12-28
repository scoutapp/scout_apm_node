import * as test from "tape";
import { Test } from "tape";

import {
    splitAgentResponses,
} from "../lib/types";

import * as TestFixtures from "./fixtures";

test("splitAgentResponse parses well formed headers", t => {
    const buf = Buffer.from(TestFixtures.RESPONSES.V1_REGISTER.COMPLETE, "utf8");
    console.log("before");
    const result = splitAgentResponses(buf);
    console.log("afer");
    
    t.assert(result, "result was returned");
    t.equals(result.framed.length, 1, "exactly one framed message was returned");
    t.equals(result.remaining.length, 0, "exactly one framed message was returned");

    t.end();
});
