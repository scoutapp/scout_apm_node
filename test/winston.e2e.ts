import * as test from "tape";
import * as winston from "winston";

const tmp = require("tmp");

import {
    buildWinstonLogFn,
    LogLevel,
} from "../lib/types";

import { ScoutConfiguration } from "../lib/types";

import * as TestUtil from "./util";
import { MockAgent } from "./integration/mock-agent";

test("Winston logger is successfully logged to", t => {
    let scout: any;
    let mockAgent: MockAgent;
    let logger: winston.Logger;

    Promise.resolve(tmp.fileSync().name)
        .then((filename: string) => {
            logger = winston.createLogger({transports: [
                new winston.transports.File({filename}),
            ]});
            const logFn = buildWinstonLogFn(logger);
            return TestUtil.buildTestScoutInstanceWithMock({}, {logFn});
        })
        .then(({scout: s, mockAgent: ma}) => {
            scout = s;
            mockAgent = ma;
        })
        .then(() => scout.setup())
        .then((s: any) => t.assert(s, "scout object was successfully set up"))
        .then(() => new Promise((resolve, reject) => {
            logger.query(
                {until: new Date(), limit: 10, fields: ["message"]},
                (err: any, results: any) => {
                    if (err || !results) {
                        t.fail("no results returned from querying the logger");
                        reject();
                        return;
                    }

                    t.assert(results.file.length > 0, "results were returned from querying logger");
                    resolve();
                });
        }))
        .then(() => TestUtil.shutdownScoutAndMock(t, scout, mockAgent))
        .catch((err: Error) => TestUtil.shutdownScoutAndMock(t, scout, mockAgent, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/135
test("Scout inherits winston logger level", t => {
    let scout: any;
    let mockAgent: MockAgent;
    let logger: winston.Logger;
    let scoutConfig: Partial<ScoutConfiguration>;

    Promise.resolve(tmp.fileSync().name)
        .then((filename: string) => {
            logger = winston.createLogger({
                level: "debug",
                transports: [
                    new winston.transports.File({filename}),
                ],
            });
            const logFn = buildWinstonLogFn(logger);
            scoutConfig = {allowShutdown: true, monitor: true};
            t.equals(scoutConfig.logLevel, undefined, "scout log level is initially undefined");
            return TestUtil.buildTestScoutInstanceWithMock(scoutConfig, {logFn});
        })
        .then(({scout: s, mockAgent: ma}) => {
            scout = s;
            mockAgent = ma;
        })
        .then(() => scout.setup())
        .then((s: any) => {
            t.assert(s, "scout object was successfully set up");
            t.equals(scout.getConfig().logLevel, LogLevel.Debug, "scout log level was updated to match winston");
        })
        .then(() => TestUtil.shutdownScoutAndMock(t, scout, mockAgent))
        .catch((err: Error) => TestUtil.shutdownScoutAndMock(t, scout, mockAgent, err));
});
