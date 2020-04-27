"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const scout_1 = require("./scout");
const types_1 = require("./types");
// Create an export bag which will contain exports modified by scout
exports.EXPORT_BAG = {};
// Global scout instance
let SCOUT_INSTANCE;
let creating;
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
function getActiveGlobalScoutInstance() {
    if (SCOUT_INSTANCE && SCOUT_INSTANCE.isShutdown()) {
        return null;
    }
    return SCOUT_INSTANCE;
}
exports.getActiveGlobalScoutInstance = getActiveGlobalScoutInstance;
function getOrCreateActiveGlobalScoutInstance(config, opts) {
    if (SCOUT_INSTANCE && !SCOUT_INSTANCE.isShutdown()) {
        return SCOUT_INSTANCE.setup();
    }
    if (creating) {
        return creating;
    }
    const instance = new scout_1.Scout(types_1.buildScoutConfiguration(config), opts);
    setActiveGlobalScoutInstance(instance);
    // Set creating to the currently executing promise to ensure that setup won't be triggered twice
    creating = instance.setup();
    return creating;
}
exports.getOrCreateActiveGlobalScoutInstance = getOrCreateActiveGlobalScoutInstance;
function shutdownActiveGlobalScoutInstance() {
    if (SCOUT_INSTANCE) {
        SCOUT_INSTANCE.shutdown()
            .then(() => SCOUT_INSTANCE = null);
    }
    return Promise.resolve();
}
exports.shutdownActiveGlobalScoutInstance = shutdownActiveGlobalScoutInstance;
function isActiveGlobalScoutInstance(scout) {
    return scout === SCOUT_INSTANCE;
}
exports.isActiveGlobalScoutInstance = isActiveGlobalScoutInstance;
