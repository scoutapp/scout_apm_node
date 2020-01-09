"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./scout"));
var types_1 = require("./types");
exports.ScoutAgentEvent = types_1.AgentEvent;
exports.ScoutEvent = types_1.ScoutEvent;
exports.ApplicationMetadata = types_1.ApplicationMetadata;
exports.buildScoutConfiguration = types_1.buildScoutConfiguration;
exports.LogLevel = types_1.LogLevel;
exports.consoleLogFn = types_1.consoleLogFn;
exports.buildWinstonLogFn = types_1.buildWinstonLogFn;
var express_1 = require("./express");
exports.expressMiddleware = express_1.scoutMiddleware;
__export(require("./errors"));
const pg_1 = require("./integrations/pg");
// Create an export bag which will contain
exports.EXPORT_BAG = {};
// Set up PG integration
pg_1.default.ritmHook(exports.EXPORT_BAG);
