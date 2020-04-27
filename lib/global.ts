import { Scout, ScoutOptions } from "./scout";
import { buildScoutConfiguration, LogLevel, ScoutConfiguration } from "./types";
import { ExportBag } from "./types/integrations";

// Create an export bag which will contain exports modified by scout
export const EXPORT_BAG: ExportBag = {};

// Global scout instance
let SCOUT_INSTANCE: Scout | null;
let creating: Promise<Scout>;

export function setActiveGlobalScoutInstance(scout: Scout) {
    if (SCOUT_INSTANCE && !SCOUT_INSTANCE.isShutdown()) {
        SCOUT_INSTANCE.log("[scout/global] A global scout instance is already set", LogLevel.Warn);
        return;
    }

    SCOUT_INSTANCE = scout;

    // When the global scout instance is set ensure that it's integrations are setup
    SCOUT_INSTANCE.setupIntegrations();
}

export function getActiveGlobalScoutInstance(): Scout | null {
    if (SCOUT_INSTANCE && SCOUT_INSTANCE.isShutdown()) {
        return null;
    }
    return SCOUT_INSTANCE;
}

export function getOrCreateActiveGlobalScoutInstance(
    config?: Partial<ScoutConfiguration>,
    opts?: ScoutOptions,
): Promise<Scout> {
    if (SCOUT_INSTANCE && !SCOUT_INSTANCE.isShutdown()) { return SCOUT_INSTANCE.setup(); }
    if (creating) { return creating; }

    const instance = new Scout(buildScoutConfiguration(config), opts);
    setActiveGlobalScoutInstance(instance);

    // Set creating to the currently executing promise to ensure that setup won't be triggered twice
    creating = instance.setup();
    return creating;
}

export function shutdownActiveGlobalScoutInstance(): Promise<void> {
    if (SCOUT_INSTANCE) {
        SCOUT_INSTANCE.shutdown()
            .then(() => SCOUT_INSTANCE = null);
    }

    return Promise.resolve();
}

export function isActiveGlobalScoutInstance(scout: Scout): boolean {
    return scout === SCOUT_INSTANCE;
}
