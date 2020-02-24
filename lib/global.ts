import { Scout } from "./scout";
import { ScoutConfiguration, buildScoutConfiguration } from "./types";
import { ExportBag } from "./types/integrations";

// Create an export bag which will contain exports modified by scout
export const EXPORT_BAG: ExportBag = {};

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
