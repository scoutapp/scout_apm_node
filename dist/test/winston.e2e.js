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
const tempfile = require("tempfile");
const types_1 = require("../lib/types");
const scout_1 = require("../lib/scout");
const TestUtil = __importStar(require("./util"));
(0, tape_1.default)("Winston logger is successfully logged to", t => {
    let scout;
    let logger;
    // Create a temp file for winston to log to
    Promise.resolve(tempfile())
        .then(filename => {
        // Build the winston logger
        logger = winston.createLogger({ transports: [
                new winston.transports.File({ filename }),
            ] });
        const logFn = (0, types_1.buildWinstonLogFn)(logger);
        // Build scout instance
        scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({ allowShutdown: true, monitor: true }), { logFn });
    })
        // Run scout setup (which should output log messages)
        .then(() => scout.setup())
        .then(scout => t.assert(scout, "scout object was successfully set up"))
        // Check that winston received some logs
        .then(() => new Promise((resolve, reject) => {
        logger.query({ until: new Date(), limit: 10, fields: ["message"] }, (err, results) => {
            if (err || !results) {
                t.fail("no results returned from querying the logger");
                reject();
            }
            // Winston query results are of the form {file: [...]}
            t.assert(results.file.length > 0, "results were returned from querying logger");
            resolve(undefined);
        });
    }))
        // Teardown and end test
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// https://github.com/scoutapp/scout_apm_node/issues/135
(0, tape_1.default)("Scout inherits winston logger level", t => {
    let scout;
    let logger;
    let scoutConfig;
    // Create a temp file for winston to log to
    Promise.resolve(tempfile())
        .then(filename => {
        // Build the winston logger
        logger = winston.createLogger({
            level: "debug",
            transports: [
                new winston.transports.File({ filename }),
            ],
        });
        const logFn = (0, types_1.buildWinstonLogFn)(logger);
        // Build scout instance
        scoutConfig = (0, types_1.buildScoutConfiguration)({ allowShutdown: true, monitor: true });
        t.equals(scoutConfig.logLevel, undefined, "scout log level is initially undefined");
        scout = new scout_1.Scout(scoutConfig, { logFn });
    })
        // Run scout setup (which should output log messages)
        .then(() => scout.setup())
        // Check that scout's log level was updated to what winston's was set to (debug)
        .then(scout => {
        t.assert(scout, "scout object was successfully set up");
        t.equals(scoutConfig.logLevel, types_1.LogLevel.Debug, "scout log level was updated to match winston");
    })
        // Teardown and end test
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
