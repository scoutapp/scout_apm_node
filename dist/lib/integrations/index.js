"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("./pg");
const integrations_1 = require("../types/integrations");
const INTEGRATION_LOOKUP = {};
INTEGRATION_LOOKUP[pg_1.default.getPackageName()] = pg_1.default;
function getIntegrationForPackage(pkg) {
    return INTEGRATION_LOOKUP[pkg] || integrations_1.doNothingRequireIntegration;
}
exports.getIntegrationForPackage = getIntegrationForPackage;
