"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setGlobalLastUsedOptions = exports.setGlobalLastUsedConfiguration = exports.isActiveGlobalScoutInstance = exports.shutdownActiveGlobalScoutInstance = exports.getOrCreateActiveGlobalScoutInstanceNonBlocking = exports.getOrCreateActiveGlobalScoutInstance = exports.getActiveGlobalScoutInstance = exports.setActiveGlobalScoutInstance = exports.EXPORT_BAG = void 0;
const scout_1 = require("./scout");
const types_1 = require("./types");
const Errors = require("./errors");
// Create an export bag which will contain exports modified by scout
exports.EXPORT_BAG = {};
// Global scout instance
let SCOUT_INSTANCE;
let creating;
// Last set of configuration used
let LAST_USED_CONFIG = null;
let LAST_USED_OPTS = null;
/**
 * Set the active global scout instance
 *
 * @param {Scout} scout
 */
function setActiveGlobalScoutInstance(scout) {
    if (SCOUT_INSTANCE && !SCOUT_INSTANCE.isShutdown()) {
        SCOUT_INSTANCE.log("[scout/global] A global scout instance is already set", types_1.LogLevel.Warn);
        return;
    }
    SCOUT_INSTANCE = scout;
    // When the global scout instance is set ensure that it's integrations are setup
    SCOUT_INSTANCE.setupIntegrations();
}
exports.setActiveGlobalScoutInstance = setActiveGlobalScoutInstance;
/**
 * Get the current active global scout instance
 *
 * @returns {Scout | null} the active global scout instance if there is one
 */
function getActiveGlobalScoutInstance() {
    if (SCOUT_INSTANCE && SCOUT_INSTANCE.isShutdown()) {
        return null;
    }
    return SCOUT_INSTANCE;
}
exports.getActiveGlobalScoutInstance = getActiveGlobalScoutInstance;
/**
 * Get or create the current active global scout instance
 *
 * @param {ScoutConfiguration} [config] - Scout configuration to use to create (if necessary)
 * @param {ScoutOptions} [opts] - options
 * @returns {Promise<Scout>} created or retrieved Scout instance
 */
function getOrCreateActiveGlobalScoutInstance(config, opts) {
    if (SCOUT_INSTANCE && !SCOUT_INSTANCE.isShutdown()) {
        return SCOUT_INSTANCE.setup();
    }
    if (creating) {
        return creating;
    }
    // If config/opts were provided, save them
    if (config) {
        setGlobalLastUsedConfiguration(config);
    }
    if (opts) {
        setGlobalLastUsedOptions(opts);
    }
    // If no configuration was passed for scout, alert the user
    if (!config) {
        // tslint:disable-next-line no-console
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
    if (!config && LAST_USED_CONFIG) {
        config = LAST_USED_CONFIG;
    }
    const instance = new scout_1.Scout(types_1.buildScoutConfiguration(config), opts);
    setActiveGlobalScoutInstance(instance);
    // Set up a listener if the global instance is ever shut down
    instance.on(types_1.ScoutEvent.Shutdown, () => {
        instance.log("[scout/global] The global instance has shut down, clearing global singleton", types_1.LogLevel.Warn);
        SCOUT_INSTANCE = null;
        creating = null;
    });
    // Set creating to the currently executing promise to ensure that setup won't be triggered twice
    creating = instance.setup();
    return creating;
}
exports.getOrCreateActiveGlobalScoutInstance = getOrCreateActiveGlobalScoutInstance;
/**
 * Lazily get or create the current active global scout instance
 *
 * @param {ScoutConfiguration} [config] - Scout configuration to use to create (if necessary)
 * @param {ScoutOptions} [opts] - options
 * @returns {Promise<Scout>} created or retrieved Scout instance
 */
function getOrCreateActiveGlobalScoutInstanceNonBlocking(config, opts) {
    const p = getOrCreateActiveGlobalScoutInstance(config, opts);
    // If the promise isn't yet resolved, then let's not wait on it and *fail* immediately
    // eventually, the promise will be resolved, and when called again, we'll pass back the instance
    return Promise.race([p, Promise.reject(new Errors.InstanceNotReady())]);
}
exports.getOrCreateActiveGlobalScoutInstanceNonBlocking = getOrCreateActiveGlobalScoutInstanceNonBlocking;
/**
 * Shutdown the active global scout instance if there is one
 *
 * @returns {Promise<void>} A promise that resolves when the shutdown has completed
 */
function shutdownActiveGlobalScoutInstance() {
    if (SCOUT_INSTANCE && !SCOUT_INSTANCE.isShutdown) {
        return SCOUT_INSTANCE.shutdown();
    }
    return Promise.resolve();
}
exports.shutdownActiveGlobalScoutInstance = shutdownActiveGlobalScoutInstance;
/**
 * Check if a given scout instance is the active global scout instance
 *
 * @param {Scout} scout
 * @returns {boolean} whether the scout is same instance
 */
function isActiveGlobalScoutInstance(scout) {
    return scout === SCOUT_INSTANCE;
}
exports.isActiveGlobalScoutInstance = isActiveGlobalScoutInstance;
/**
 * Set the last used scout configuration, to support flexibility in setup from middleware or scout.install()
 *
 * @param {Partial<ScoutConfiguration>} config
 */
function setGlobalLastUsedConfiguration(config) {
    LAST_USED_CONFIG = config;
}
exports.setGlobalLastUsedConfiguration = setGlobalLastUsedConfiguration;
/**
 * Set the last used scout options, to support flexibility in setup from middleware or scout.install()
 *
 * @param {Partial<ScoutOptsuration>} opts
 */
function setGlobalLastUsedOptions(opts) {
    LAST_USED_OPTS = opts;
}
exports.setGlobalLastUsedOptions = setGlobalLastUsedOptions;
