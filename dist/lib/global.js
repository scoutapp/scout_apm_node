"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
