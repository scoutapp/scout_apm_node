import { Scout, ScoutOptions } from "./scout";
import { buildScoutConfiguration, LogLevel, ScoutConfiguration, ScoutEvent } from "./types";
import { ExportBag } from "./types/integrations";

// Create an export bag which will contain exports modified by scout
export const EXPORT_BAG: ExportBag = {};

// Global scout instance
let SCOUT_INSTANCE: Scout | null;
let creating: Promise<Scout> | null;

/**
 * Set the active global scout instance
 *
 * @param {Scout} scout
 */
export function setActiveGlobalScoutInstance(scout: Scout) {
    if (SCOUT_INSTANCE && !SCOUT_INSTANCE.isShutdown()) {
        SCOUT_INSTANCE.log("[scout/global] A global scout instance is already set", LogLevel.Warn);
        return;
    }

    SCOUT_INSTANCE = scout;

    // When the global scout instance is set ensure that it's integrations are setup
    SCOUT_INSTANCE.setupIntegrations();
}

/**
 * Get the current active global scout instance
 *
 * @returns {Scout | null} the active global scout instance if there is one
 */
export function getActiveGlobalScoutInstance(): Scout | null {
    if (SCOUT_INSTANCE && SCOUT_INSTANCE.isShutdown()) {
        return null;
    }
    return SCOUT_INSTANCE;
}

/**
 * Get or create the current active global scout instance
 *
 * @param {ScoutConfiguration} [config] - Scout configuration to use to create (if necessary)
 * @param {ScoutOptions} [opts] - options
 * @returns {Promise<Scout>} created or retrieved Scout instance
 */
export function getOrCreateActiveGlobalScoutInstance(
    config?: Partial<ScoutConfiguration>,
    opts?: ScoutOptions,
): Promise<Scout> {
    if (SCOUT_INSTANCE && !SCOUT_INSTANCE.isShutdown()) { return SCOUT_INSTANCE.setup(); }
    if (creating) { return creating; }

    const instance = new Scout(buildScoutConfiguration(config), opts);
    setActiveGlobalScoutInstance(instance);

    // Set up a listener if the global instance is ever shut down
    instance.on(ScoutEvent.Shutdown, () => {
        instance.log("[scout/global] The global instance has shut down, clearing global singleton", LogLevel.Warn);
        SCOUT_INSTANCE = null;
        creating = null;
    });

    // Set creating to the currently executing promise to ensure that setup won't be triggered twice
    creating = instance.setup();
    return creating;
}

/**
 * Shutdown the active global scout instance if there is one
 *
 * @returns {Promise<void>} A promise that resolves when the shutdown has completed
 */
export function shutdownActiveGlobalScoutInstance(): Promise<void> {
    if (SCOUT_INSTANCE && !SCOUT_INSTANCE.isShutdown) {
        return SCOUT_INSTANCE.shutdown();
    }

    return Promise.resolve();
}

/**
 * Check if a given scout instance is the active global scout instance
 *
 * @param {Scout} scout
 * @returns {boolean} whether the scout is same instance
 */
export function isActiveGlobalScoutInstance(scout: Scout): boolean {
    return scout === SCOUT_INSTANCE;
}
