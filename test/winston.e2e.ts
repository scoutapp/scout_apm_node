import * as test from "tape";
import * as winston from "winston";

const tempfile = require("tempfile");

import {
    Scout,
    ScoutRequest,
    ScoutSpan,
    buildScoutConfiguration,
    buildWinstonLogFn,
    LogLevel,
} from "../lib";

import { ScoutConfiguration } from "../lib/types";

import * as TestUtil from "./util";

// test("Winston logger is successfully logged to", t => {
//     let scout: Scout;
//     let logger: winston.Logger;

//     // Create a temp file for winston to log to
//     Promise.resolve(tempfile())
//         .then(filename => {
//             // Build the winston logger
//             logger = winston.createLogger({transports: [
//                 new winston.transports.File({filename}),
//             ]});
//             const logFn = buildWinstonLogFn(logger);

//             // Build scout instance
//             scout = new Scout(
//                 buildScoutConfiguration({allowShutdown: true, monitor: true}),
//                 {logFn},
//             );
//         })
//     // Run scout setup (which should output log messages)
//         .then(() => scout.setup())
//         .then(scout => t.assert(scout, "scout object was successfully set up"))
//     // Check that winston received some logs
//         .then(() => new Promise((resolve, reject) => {
//             logger.query(
//                 {until: new Date(), limit: 10, fields: ["message"]},
//                 (err, results) => {
//                     if (err || !results) {
//                         t.fail("no results returned from querying the logger");
//                         reject();
//                     }

//                     // Winston query results are of the form {file: [...]}
//                     t.assert(results.file.length > 0, "results were returned from querying logger");
//                     resolve();
//                 });
//         }))
//     // Teardown and end test
//         .then(() => TestUtil.shutdownScout(t, scout))
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// https://github.com/scoutapp/scout_apm_node/issues/135
test("Scout inherits winston logger level", t => {
    let scout: Scout;
    let logger: winston.Logger;

    let scoutConfig: Partial<ScoutConfiguration>;

    // Create a temp file for winston to log to
    Promise.resolve(tempfile())
        .then(filename => {
            // Build the winston logger
            logger = winston.createLogger({
                level: "debug",
                transports: [
                    new winston.transports.File({filename}),
                ],
            });
            const logFn = buildWinstonLogFn(logger);

            // Build scout instance
            scoutConfig = buildScoutConfiguration({allowShutdown: true, monitor: true});
            t.equals(scoutConfig.logLevel, undefined, "scout log level is initially undefined");
            scout = new Scout(scoutConfig, {logFn});
        })
    // Run scout setup (which should output log messages)
        .then(() => scout.setup())
    // Check that scout's log level was updated to what winston's was set to (debug)
        .then(scout => {
            t.assert(scout, "scout object was successfully set up");
            t.equals(scoutConfig.logLevel, LogLevel.Debug, "scout log level was updated to match winston");
        })
    // Teardown and end test
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
