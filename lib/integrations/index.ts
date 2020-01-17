import pgIntegration from "./pg";
import mysqlIntegration from "./mysql";
import mysql2Integration from "./mysql2";
import { doNothingRequireIntegration, RequireIntegration } from "../types/integrations";

export function getIntegrationForPackage(pkg: string): RequireIntegration {
    switch (pkg) {
        case pgIntegration.getPackageName(): return pgIntegration;
        case mysqlIntegration.getPackageName(): return mysqlIntegration;
        case mysql2Integration.getPackageName(): return mysql2Integration;
        default: return doNothingRequireIntegration;
    }
}
