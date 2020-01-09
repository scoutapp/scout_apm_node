"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const Errors = require("../lib/errors");
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
