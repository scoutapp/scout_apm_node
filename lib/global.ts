import { Scout } from "./scout";
import { ScoutConfiguration } from "./types";
import { buildScoutConfiguration } from "./types";

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

export function getOrCreateGlobalScoutInstance(config?: Partial<ScoutConfiguration>): Promise<Scout> {
    setGlobalScoutInstance(new Scout(config || buildScoutConfiguration()));
    return getGlobalScoutInstance().setup();
}
