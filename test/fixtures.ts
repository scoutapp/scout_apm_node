import { ApplicationMetadata } from "../lib/types";

export const APP_META: Partial<ApplicationMetadata> = {
    framework: "express",
    language: "nodejs",
};

export const RESPONSES = {
    V1: {
        REGISTER: {
            COMPLETE: '{"Register":{"id":null,"result":"Success"}}',
            PARTIAL: '{"Register":{"id":null,"',
            CHUNKED: ['{"Register":{"id":null,"', 'result":"Success"}}'],
        },
    },
};
