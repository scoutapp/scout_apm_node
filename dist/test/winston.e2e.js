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
const winston = __importStar(require("winston"));
const tmp = require("tmp");
const types_1 = require("../lib/types");
const TestUtil = __importStar(require("./util"));
(0, tape_1.default)("Winston logger is successfully logged to", t => {
    let scout;
    let mockAgent;
    let logger;
    Promise.resolve(tmp.fileSync().name)
        .then((filename) => {
        logger = winston.createLogger({ transports: [
                new winston.transports.File({ filename }),
            ] });
        const logFn = (0, types_1.buildWinstonLogFn)(logger);
        return TestUtil.buildTestScoutInstanceWithMock({}, { logFn });
    })
        .then(({ scout: s, mockAgent: ma }) => {
        scout = s;
        mockAgent = ma;
    })
        .then(() => scout.setup())
        .then((s) => t.assert(s, "scout object was successfully set up"))
        .then(() => new Promise((resolve, reject) => {
        logger.query({ until: new Date(), limit: 10, fields: ["message"] }, (err, results) => {
            if (err || !results) {
                t.fail("no results returned from querying the logger");
                reject();
                return;
            }
            t.assert(results.file.length > 0, "results were returned from querying logger");
            resolve(undefined);
        });
    }))
        .then(() => TestUtil.shutdownScoutAndMock(t, scout, mockAgent))
        .catch((err) => TestUtil.shutdownScoutAndMock(t, scout, mockAgent, err));
});
// https://github.com/scoutapp/scout_apm_node/issues/135
(0, tape_1.default)("Scout inherits winston logger level", t => {
    let scout;
    let mockAgent;
    let logger;
    let scoutConfig;
    Promise.resolve(tmp.fileSync().name)
        .then((filename) => {
        logger = winston.createLogger({
            level: "debug",
            transports: [
                new winston.transports.File({ filename }),
            ],
        });
        const logFn = (0, types_1.buildWinstonLogFn)(logger);
        scoutConfig = { allowShutdown: true, monitor: true };
        t.equals(scoutConfig.logLevel, undefined, "scout log level is initially undefined");
        return TestUtil.buildTestScoutInstanceWithMock(scoutConfig, { logFn });
    })
        .then(({ scout: s, mockAgent: ma }) => {
        scout = s;
        mockAgent = ma;
    })
        .then(() => scout.setup())
        .then((s) => {
        t.assert(s, "scout object was successfully set up");
        t.equals(scout.getConfig().logLevel, types_1.LogLevel.Debug, "scout log level was updated to match winston");
    })
        .then(() => TestUtil.shutdownScoutAndMock(t, scout, mockAgent))
        .catch((err) => TestUtil.shutdownScoutAndMock(t, scout, mockAgent, err));
});
