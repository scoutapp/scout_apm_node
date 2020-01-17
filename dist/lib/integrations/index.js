"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("./pg");
const mysql_1 = require("./mysql");
const integrations_1 = require("../types/integrations");
function getIntegrationForPackage(pkg) {
    switch (pkg) {
        case pg_1.default.getPackageName(): return pg_1.default;
        case mysql_1.default.getPackageName(): return mysql_1.default;
        default: return integrations_1.doNothingRequireIntegration;
    }
}
exports.getIntegrationForPackage = getIntegrationForPackage;
