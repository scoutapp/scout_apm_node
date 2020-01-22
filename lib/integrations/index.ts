import pgIntegration from "./pg";
import mysqlIntegration from "./mysql";
import mysql2Integration from "./mysql2";
import pugIntegration from "./pug";
import mustacheIntegration from "./mustache";
import { doNothingRequireIntegration, RequireIntegration } from "../types/integrations";

export function getIntegrationForPackage(pkg: string): RequireIntegration {
    switch (pkg) {
        case pgIntegration.getPackageName(): return pgIntegration;
        case mysqlIntegration.getPackageName(): return mysqlIntegration;
        case mysql2Integration.getPackageName(): return mysql2Integration;
        case pugIntegration.getPackageName(): return pugIntegration;
        case mustacheIntegration.getPackageName(): return mustacheIntegration;
        default: return doNothingRequireIntegration;
    }
}
