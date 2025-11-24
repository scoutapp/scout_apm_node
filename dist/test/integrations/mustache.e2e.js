"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tape_1 = __importDefault(require("tape"));
const TestUtil = __importStar(require("../util"));
const integrations_1 = require("../../lib/types/integrations");
const types_1 = require("../../lib/types");
const lib_1 = require("../../lib");
const scout_1 = require("../../lib/scout");
const fixtures_1 = require("../fixtures");
const Mustache = __importStar(require("mustache"));
// The hook for mustache has to be triggered this way in a typescript context
// since a partial import from scout itself (lib/index) will not run the setupRequireIntegrations() code
(0, lib_1.setupRequireIntegrations)(["mustache"]);
// mustache needs to be imported this way to trigger the require integration
const mustache = require("mustache");
(0, tape_1.default)("the shim works", t => {
    t.assert((0, integrations_1.getIntegrationSymbol)() in mustache, "mustache export has the integration symbol");
    t.end();
});
(0, tape_1.default)("mustache rendering a string is captured", t => {
    const scout = new scout_1.Scout((0, types_1.buildScoutConfiguration)({
        allowShutdown: true,
        monitor: true,
    }));
    const simple = fixtures_1.MUSTACHE_TEMPLATES.HELLO_WORLD;
    const interpolated = fixtures_1.MUSTACHE_TEMPLATES.HELLO_WORLD_INTERPOLATED;
    // Set up a listener for the scout request that will contain the DB record
    const listener = (data) => {
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Look up the template render span from the request
        data.request
            .getChildSpans()
            .then(spans => {
            const renderSpans = spans.filter(s => s.operation === types_1.ScoutSpanOperation.TemplateRender);
            t.assert(renderSpans, "template render span was present on request");
            t.equals(renderSpans.length, 2, "two template spans were present");
            t.assert(renderSpans.every(s => s.getContextValue(types_1.ScoutContextName.Name) === "<string>"), "render spans had <string> as name context");
        })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    // Activate the listener
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        // Start a scout transaction & render a string
        .then(() => scout.transactionSync("Controller/mustache-render-string-test", () => {
        const renderedSimple = Mustache.render(simple.template, {});
        t.equals(renderedSimple, "Hello world", "simple template is rendered properly");
        const renderedInterpolated = Mustache.render(interpolated.template, { name: "test" });
        t.equals(renderedInterpolated, "Hello test", "template with interpolation is rendered properly");
    }))
        // If an error occurs, shutdown scout
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
