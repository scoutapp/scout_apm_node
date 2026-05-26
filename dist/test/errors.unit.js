"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const tape_1 = tslib_1.__importDefault(require("tape"));
const Errors = tslib_1.__importStar(require("../lib/errors"));
(0, tape_1.default)("NotImplementedError code", t => {
    const err = new Errors.NotImplemented();
    t.equals(err.code, Errors.ErrorCode.NotImplemented, "code matches ErrorCode entry");
    t.end();
});
(0, tape_1.default)("InvalidVersion code", t => {
    const err = new Errors.InvalidVersion();
    t.equals(err.code, Errors.ErrorCode.InvalidVersion, "code matches ErrorCode entry");
    t.end();
});
