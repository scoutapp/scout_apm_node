import { Scout } from "./scout";

// Global scout instance
let SCOUT_INSTANCE: Scout;

export function setGlobalScoutInstance(scout: Scout) {
    SCOUT_INSTANCE = scout;
    // When the global scout instance is set ensure that it's integrations are set
    scout.setupIntegrations();
}

export function getGlobalScoutInstance() {
    return SCOUT_INSTANCE;
}
