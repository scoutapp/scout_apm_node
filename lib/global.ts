import { Scout, ScoutOptions } from "./scout";
import { buildScoutConfiguration, LogLevel, ScoutConfiguration } from "./types";
import { ExportBag } from "./types/integrations";

// Create an export bag which will contain exports modified by scout
export const EXPORT_BAG: ExportBag = {};

// Global scout instance
let SCOUT_INSTANCE: Scout;
let creating: Promise<Scout> | undefined = undefined;

export function setGlobalScoutInstance(scout: Scout) {
    if (SCOUT_INSTANCE) {
        SCOUT_INSTANCE.log("[scout/global] A global scout instance is already set", LogLevel.Error);
        return;
    }

    SCOUT_INSTANCE = scout;
    // When the global scout instance is set ensure that it's integrations are set
    scout.setupIntegrations();
}

export function getGlobalScoutInstance() {
    return SCOUT_INSTANCE;
}

export function getOrCreateGlobalScoutInstance(
    config?: Partial<ScoutConfiguration>,
    opts?: ScoutOptions,
): Promise<Scout> {
    if (SCOUT_INSTANCE) { return SCOUT_INSTANCE.setup(); }
    if (creating) { return creating; }

    setGlobalScoutInstance(new Scout(config || buildScoutConfiguration(), opts));

    // Set creating to the currently executing promise to ensure that setup won't be triggered twice
    creating = getGlobalScoutInstance().setup();
    return creating;
}
