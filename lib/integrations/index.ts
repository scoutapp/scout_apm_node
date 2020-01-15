import pgIntegration from "./pg";
import mysqlIntegration from "./mysql";
import { doNothingRequireIntegration, RequireIntegration } from "../types/integrations";

export function getIntegrationForPackage(pkg: string): RequireIntegration {
    switch (pkg) {
        case pgIntegration.getPackageName(): return pgIntegration;
        case mysqlIntegration.getPackageName(): return mysqlIntegration;
        default: return doNothingRequireIntegration;
    }
}
