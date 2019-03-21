import * as test from "tape";

import * as Errors from "../lib/errors";

test("NotImplementedError code", t => {
    const err = new Errors.NotImplemented();
    t.equals(err.code, Errors.ErrorCode.NotImplemented, "code matches ErrorCode entry");
    t.end();
});

test("InvalidVersion code", t => {
    const err = new Errors.InvalidVersion();
    t.equals(err.code, Errors.ErrorCode.InvalidVersion, "code matches ErrorCode entry");
    t.end();
});
