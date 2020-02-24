"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const scout_1 = require("./scout");
const types_1 = require("./types");
// Create an export bag which will contain exports modified by scout
exports.EXPORT_BAG = {};
// Global scout instance
let SCOUT_INSTANCE;
function setGlobalScoutInstance(scout) {
    SCOUT_INSTANCE = scout;
    // When the global scout instance is set ensure that it's integrations are set
    scout.setupIntegrations();
}
exports.setGlobalScoutInstance = setGlobalScoutInstance;
function getGlobalScoutInstance() {
    return SCOUT_INSTANCE;
}
exports.getGlobalScoutInstance = getGlobalScoutInstance;
function getOrCreateGlobalScoutInstance(config) {
    setGlobalScoutInstance(new scout_1.Scout(config || types_1.buildScoutConfiguration()));
    return getGlobalScoutInstance().setup();
}
exports.getOrCreateGlobalScoutInstance = getOrCreateGlobalScoutInstance;
