import { Scout, ScoutOptions } from "./scout";
import { buildScoutConfiguration, LogLevel, ScoutConfiguration, ScoutEvent } from "./types";
import { ExportBag } from "./types/integrations";
import * as Errors from "./errors";

// Create an export bag which will contain exports modified by scout
export const EXPORT_BAG: ExportBag = {};

// Global scout instance
let SCOUT_INSTANCE: Scout | null;
let creating: Promise<Scout> | null;

// Last set of configuration used
let LAST_USED_CONFIG: Partial<ScoutConfiguration> | null = null;
let LAST_USED_OPTS: ScoutOptions | null = null;

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

    // If config/opts were provided, save them
    if (config) { setGlobalLastUsedConfiguration(config); }
    if (opts) { setGlobalLastUsedOptions(opts); }

    // If no configuration was passed for scout, alert the user
    if (!config) {
        console.log("[scout] no configuration provided, one will be created from ENV & defaults");
    }

    // If config and/or opts weren't provided but they *were* provided previously to a different setup method
    // ex. scout.expressMiddleware({ ... }) is called, and scout.install() is called afterwards
    // see: https://github.com/scoutapp/scout_apm_node/issues/226
    if (!config && LAST_USED_CONFIG) {
        config = LAST_USED_CONFIG;
        LAST_USED_CONFIG = null;
    }
    if (!opts && LAST_USED_OPTS) {
        opts = LAST_USED_OPTS;
        LAST_USED_OPTS = null;
    }

    if (!config && LAST_USED_CONFIG) { config = LAST_USED_CONFIG; }

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
 * Lazily get or create the current active global scout instance
 *
 * @param {ScoutConfiguration} [config] - Scout configuration to use to create (if necessary)
 * @param {ScoutOptions} [opts] - options
 * @returns {Promise<Scout>} created or retrieved Scout instance
 */
export function getOrCreateActiveGlobalScoutInstanceNonBlocking(
    config?: Partial<ScoutConfiguration>,
    opts?: ScoutOptions,
): Promise<Scout> {
    const p = getOrCreateActiveGlobalScoutInstance(config, opts);

    // If the promise isn't yet resolved, then let's not wait on it and *fail* immediately
    // eventually, the promise will be resolved, and when called again, we'll pass back the instance
    return Promise.race([p, Promise.reject(new Errors.InstanceNotReady())]);
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

/**
 * Set the last used scout configuration, to support flexibility in setup from middleware or scout.install()
 *
 * @param {Partial<ScoutConfiguration>} config
 */
export function setGlobalLastUsedConfiguration(config: Partial<ScoutConfiguration>): void {
    LAST_USED_CONFIG = config;
}

/**
 * Set the last used scout options, to support flexibility in setup from middleware or scout.install()
 *
 * @param {Partial<ScoutOptsuration>} opts
 */
export function setGlobalLastUsedOptions(opts: ScoutOptions): void {
    LAST_USED_OPTS = opts;
}
