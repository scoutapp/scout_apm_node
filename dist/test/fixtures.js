"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APP_META = {
    framework: "express",
    language: "nodejs",
};
exports.RESPONSES = {
    V1: {
        REGISTER: {
            COMPLETE: '{"Register":{"id":null,"result":"Success"}}',
            PARTIAL: '{"Register":{"id":null,"',
            CHUNKED: ['{"Register":{"id":null,"', 'result":"Success"}}'],
        },
    },
};
