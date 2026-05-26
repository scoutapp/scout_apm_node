"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
const SKIP_COMMANDS = new Set([
    "ping", "hello", "ismaster", "isMaster",
    "endSessions", "buildInfo", "getLastError",
]);
// Max in-flight entries; prevents unbounded growth when connections die without emitting commandFailed.
const MAX_IN_FLIGHT = 1000;
function scrubCommand(command) {
    return JSON.stringify(command, (key, value) => {
        if (value === null || typeof value !== "object") {
            return "?";
        }
        return value;
    });
}
class MongoDBIntegration extends integrations_1.RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "mongodb";
    }
    shim(mongoExport) {
        const OriginalMongoClient = mongoExport.MongoClient;
        if (!OriginalMongoClient || !OriginalMongoClient.prototype) {
            return mongoExport;
        }
        const integration = this;
        // MongoClient freezes its options object during construction, so monitorCommands
        // cannot be set after the fact. Use a Proxy construct trap to inject the flag
        // before parseOptions() runs, then attach the CommandMonitor listeners.
        const PatchedMongoClient = new Proxy(OriginalMongoClient, {
            construct(target, args) {
                const [url, options, ...rest] = args;
                const instance = new target(url, Object.assign(Object.assign({}, options), { monitorCommands: true }), ...rest);
                integration.attachCommandMonitor(instance);
                return instance;
            },
        });
        // MongoClient is exported as a configurable getter-only; replace with a data property.
        Object.defineProperty(mongoExport, "MongoClient", {
            value: PatchedMongoClient,
            writable: true,
            configurable: true,
            enumerable: true,
        });
        return mongoExport;
    }
    attachCommandMonitor(client) {
        const inFlight = new Map();
        const integration = this;
        client.on("commandStarted", (event) => {
            var _a;
            if (!integration.scout) {
                return;
            }
            if (SKIP_COMMANDS.has(event.commandName)) {
                return;
            }
            if (inFlight.size >= MAX_IN_FLIGHT) {
                const oldestKey = inFlight.keys().next().value;
                if (oldestKey !== undefined) {
                    const entry = inFlight.get(oldestKey);
                    entry.done();
                    inFlight.delete(oldestKey);
                }
            }
            const key = `${event.connectionId}:${event.requestId}`;
            const collection = String((_a = event.command[event.commandName], (_a !== null && _a !== void 0 ? _a : "unknown")));
            const op = `MongoDB/${collection}/${event.commandName}`;
            const stmt = scrubCommand(event.command);
            integration.scout.instrument(op, (done) => {
                const span = integration.scout ? integration.scout.getCurrentSpan() : null;
                if (span) {
                    span.addContext(types_1.ScoutContextName.DBStatement, stmt);
                }
                inFlight.set(key, { done, span, startedAt: Date.now() });
            });
        });
        client.on("commandSucceeded", (event) => {
            const key = `${event.connectionId}:${event.requestId}`;
            const entry = inFlight.get(key);
            if (!entry) {
                return;
            }
            inFlight.delete(key);
            integration.logFn(`[scout/integrations/mongodb] ${event.commandName} succeeded`, types_1.LogLevel.Trace);
            entry.done();
        });
        client.on("commandFailed", (event) => {
            const key = `${event.connectionId}:${event.requestId}`;
            const entry = inFlight.get(key);
            if (!entry) {
                return;
            }
            inFlight.delete(key);
            if (entry.span) {
                entry.span.addContext(types_1.ScoutContextName.Error, "true");
            }
            integration.logFn(`[scout/integrations/mongodb] ${event.commandName} failed: ${event.failure}`, types_1.LogLevel.Trace);
            entry.done();
        });
    }
}
exports.MongoDBIntegration = MongoDBIntegration;
exports.default = new MongoDBIntegration();
