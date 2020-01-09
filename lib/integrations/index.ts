import pgIntegration from "./pg";
import { doNothingRequireIntegration, RequireIntegration } from "../types/integrations";

const INTEGRATION_LOOKUP = {};
INTEGRATION_LOOKUP[pgIntegration.getPackageName()] = pgIntegration;

export function getIntegrationForPackage(pkg: string): RequireIntegration {
    return INTEGRATION_LOOKUP[pkg] || doNothingRequireIntegration;
}
