"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("./pg");
const mysql_1 = require("./mysql");
const mysql2_1 = require("./mysql2");
const pug_1 = require("./pug");
const mustache_1 = require("./mustache");
const ejs_1 = require("./ejs");
const http_1 = require("./http");
const express_1 = require("./express");
const nuxt_1 = require("./nuxt");
const https_1 = require("./https");
const ioredis_1 = require("./ioredis");
const prisma_1 = require("./prisma");
const fetch_1 = require("./fetch");
const redis_1 = require("./redis");
const mongodb_1 = require("./mongodb");
const integrations_1 = require("../types/integrations");
exports.KNOWN_PACKAGES = [
    pg_1.default.getPackageName(),
    mysql_1.default.getPackageName(),
    mysql2_1.default.getPackageName(),
    pug_1.default.getPackageName(),
    mustache_1.default.getPackageName(),
    ejs_1.default.getPackageName(),
    http_1.default.getPackageName(),
    express_1.default.getPackageName(),
    nuxt_1.default.getPackageName(),
    https_1.default.getPackageName(),
    ioredis_1.default.getPackageName(),
    prisma_1.default.getPackageName(),
    fetch_1.default.getPackageName(),
    redis_1.default.getPackageName(),
    mongodb_1.default.getPackageName(),
];
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
        case mongodb_1.default.getPackageName(): return mongodb_1.default;
        default: return integrations_1.doNothingRequireIntegration;
    }
}
exports.getIntegrationForPackage = getIntegrationForPackage;
