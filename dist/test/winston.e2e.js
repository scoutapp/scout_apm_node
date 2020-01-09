"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const winston = require("winston");
const tempfile = require("tempfile");
const lib_1 = require("../lib");
const TestUtil = require("./util");
test("Winston logger is successfully logged to", t => {
    let scout;
    let logger;
    // Create a temp file for winston to log to
    Promise.resolve(tempfile())
        .then(filename => {
        // Build the winston logger
        logger = winston.createLogger({ transports: [
                new winston.transports.File({ filename }),
            ] });
        const logFn = lib_1.buildWinstonLogFn(logger);
        // Build scout instance
        scout = new lib_1.Scout(lib_1.buildScoutConfiguration({ allowShutdown: true, monitor: true }), { logFn });
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
            resolve();
        });
    }))
        // Teardown and end test
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
