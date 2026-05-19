"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIntegrationForPackage = getIntegrationForPackage;
const pg_1 = __importDefault(require("./pg"));
const mysql_1 = __importDefault(require("./mysql"));
const mysql2_1 = __importDefault(require("./mysql2"));
const pug_1 = __importDefault(require("./pug"));
const mustache_1 = __importDefault(require("./mustache"));
const ejs_1 = __importDefault(require("./ejs"));
const http_1 = __importDefault(require("./http"));
const express_1 = __importDefault(require("./express"));
const nuxt_1 = __importDefault(require("./nuxt"));
const https_1 = __importDefault(require("./https"));
const ioredis_1 = __importDefault(require("./ioredis"));
const prisma_1 = __importDefault(require("./prisma"));
const fetch_1 = __importDefault(require("./fetch"));
const redis_1 = __importDefault(require("./redis"));
const integrations_1 = require("../types/integrations");
function getIntegrationForPackage(pkg) {
    switch (pkg) {
        case pg_1.default.getPackageName(): return pg_1.default;
        case mysql_1.default.getPackageName(): return mysql_1.default;
        case mysql2_1.default.getPackageName(): return mysql2_1.default;
        case pug_1.default.getPackageName(): return pug_1.default;
        case mustache_1.default.getPackageName(): return mustache_1.default;
        case ejs_1.default.getPackageName(): return ejs_1.default;
        case http_1.default.getPackageName(): return http_1.default;
        case express_1.default.getPackageName(): return express_1.default;
        case nuxt_1.default.getPackageName(): return nuxt_1.default;
        case https_1.default.getPackageName(): return https_1.default;
        case ioredis_1.default.getPackageName(): return ioredis_1.default;
        case prisma_1.default.getPackageName(): return prisma_1.default;
        case fetch_1.default.getPackageName(): return fetch_1.default;
        case redis_1.default.getPackageName(): return redis_1.default;
        default: return integrations_1.doNothingRequireIntegration;
    }
}
