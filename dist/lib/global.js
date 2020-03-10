"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const scout_1 = require("./scout");
const types_1 = require("./types");
// Create an export bag which will contain exports modified by scout
exports.EXPORT_BAG = {};
// Global scout instance
let SCOUT_INSTANCE;
let creating;
function setGlobalScoutInstance(scout) {
    if (SCOUT_INSTANCE) {
        SCOUT_INSTANCE.log("[scout/global] A global scout instance is already set", types_1.LogLevel.Warn);
        return;
    }
    SCOUT_INSTANCE = scout;
    // When the global scout instance is set ensure that it's integrations are set
    scout.setupIntegrations();
}
exports.setGlobalScoutInstance = setGlobalScoutInstance;
function getGlobalScoutInstance() {
    return SCOUT_INSTANCE;
}
exports.getGlobalScoutInstance = getGlobalScoutInstance;
function getOrCreateGlobalScoutInstance(config, opts) {
    if (SCOUT_INSTANCE) {
        return SCOUT_INSTANCE.setup();
    }
    if (creating) {
        return creating;
    }
    setGlobalScoutInstance(new scout_1.Scout(types_1.buildScoutConfiguration(config), opts));
    // Set creating to the currently executing promise to ensure that setup won't be triggered twice
    creating = getGlobalScoutInstance().setup();
    return creating;
}
exports.getOrCreateGlobalScoutInstance = getOrCreateGlobalScoutInstance;
