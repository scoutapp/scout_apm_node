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
const supertest_1 = __importDefault(require("supertest"));
const types_1 = require("../../lib/types");
const lib_1 = require("../../lib");
const scout_1 = require("../../lib/scout");
const TestUtil = __importStar(require("../util"));
const integrations_1 = require("../../lib/types/integrations");
const express_1 = require("../../lib/express");
const types_2 = require("../../lib/types");
// The hook for http has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
(0, lib_1.setupRequireIntegrations)(["http"]);
// http needs to be imported this way to trigger the require integration
const http = require("http");
(0, tape_1.default)("the shim works", t => {
    t.assert((0, integrations_1.getIntegrationSymbol)() in http, "http export has the integration symbol");
    t.end();
});
(0, tape_1.default)("http connections are captured", t => {
    const config = (0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
    });
    const scout = new scout_1.Scout(config);
    const app = TestUtil.simpleExpressApp((0, express_1.scoutMiddleware)({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }));
    let expectedReqId;
    // Set up a listener for the scout request that will contain the DB record
    const listener = (data) => {
        if (data.request.id !== expectedReqId) {
            return;
        }
        // Once we know we're looking at the right request, we can remove the listener
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Look up the external request span from the request
        data.request
            .getChildSpans()
            .then(spans => {
            const requestSpan = spans.find(s => s.operation === types_2.ScoutSpanOperation.HTTPGet);
            t.assert(requestSpan, "external request span was present on request");
            if (!requestSpan) {
                t.fail("no external request span present on request");
                throw new Error("No external request span");
            }
            // Since we don't know what port superagent will assign the request we just check if it's there
            const urlTag = requestSpan.getContextValue(types_2.ScoutContextName.URL);
            t.assert(urlTag, `url tag is present [${urlTag}]`);
        })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Activate the listener
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Start a scout transaction & request a string
        .then(() => scout.transaction("Controller/external-request-test", (finishRequest, info) => {
        // Record the expected request ID so we can look for it in the listener
        if (!info || !info.request) {
            throw new Error("Request not present on transaction start");
        }
        expectedReqId = info.request.id;
        // Send a request to the application
        return (0, supertest_1.default)(app)
            .get("/")
            .expect("Content-Type", /json/)
            .expect(200)
            .then(res => t.assert(res, "request sent"))
            .then(() => finishRequest());
    }))
        // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
