import pgIntegration from "./pg";
import mysqlIntegration from "./mysql";
import mysql2Integration from "./mysql2";
import pugIntegration from "./pug";
import mustacheIntegration from "./mustache";
import ejsIntegration from "./ejs";
import httpIntegration from "./http";
import expressIntegration from "./express";
import nuxtIntegration from "./nuxt";
import httpsIntegration from "./https";
import ioredisIntegration from "./ioredis";
import prismaIntegration from "./prisma";
import fetchIntegration from "./fetch";
import redisIntegration from "./redis";
import mongodbIntegration from "./mongodb";
import { doNothingRequireIntegration, RequireIntegration } from "../types/integrations";

export const KNOWN_PACKAGES: string[] = [
    pgIntegration.getPackageName(),
    mysqlIntegration.getPackageName(),
    mysql2Integration.getPackageName(),
    pugIntegration.getPackageName(),
    mustacheIntegration.getPackageName(),
    ejsIntegration.getPackageName(),
    httpIntegration.getPackageName(),
    expressIntegration.getPackageName(),
    nuxtIntegration.getPackageName(),
    httpsIntegration.getPackageName(),
    ioredisIntegration.getPackageName(),
    prismaIntegration.getPackageName(),
    fetchIntegration.getPackageName(),
    redisIntegration.getPackageName(),
    mongodbIntegration.getPackageName(),
];

export function getIntegrationForPackage(pkg: string): RequireIntegration {
    switch (pkg) {
        case pgIntegration.getPackageName(): return pgIntegration;
        case mysqlIntegration.getPackageName(): return mysqlIntegration;
        case mysql2Integration.getPackageName(): return mysql2Integration;
        case pugIntegration.getPackageName(): return pugIntegration;
        case mustacheIntegration.getPackageName(): return mustacheIntegration;
        case ejsIntegration.getPackageName(): return ejsIntegration;
        case httpIntegration.getPackageName(): return httpIntegration;
        case expressIntegration.getPackageName(): return expressIntegration;
        case nuxtIntegration.getPackageName(): return nuxtIntegration;
        case httpsIntegration.getPackageName(): return httpsIntegration;
        case ioredisIntegration.getPackageName(): return ioredisIntegration;
        case prismaIntegration.getPackageName(): return prismaIntegration;
        case fetchIntegration.getPackageName(): return fetchIntegration;
        case redisIntegration.getPackageName(): return redisIntegration;
        case mongodbIntegration.getPackageName(): return mongodbIntegration;
        default: return doNothingRequireIntegration;
    }
}
