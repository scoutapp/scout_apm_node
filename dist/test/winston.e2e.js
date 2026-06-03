"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const winston = require("winston");
const tmp = require("tmp");
const types_1 = require("../lib/types");
const TestUtil = require("./util");
test("Winston logger is successfully logged to", t => {
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
                reject(undefined);
                return;
            }
            t.assert(results.file.length > 0, "results were returned from querying logger");
            resolve();
        });
    }))
        .then(() => TestUtil.shutdownScoutAndMock(t, scout, mockAgent))
        .catch((err) => TestUtil.shutdownScoutAndMock(t, scout, mockAgent, err));
});
// https://github.com/scoutapp/scout_apm_node/issues/135
test("Scout inherits winston logger level", t => {
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
        scoutConfig = { monitor: true };
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
