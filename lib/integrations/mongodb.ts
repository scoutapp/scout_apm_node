import { RequireIntegration } from "../types/integrations";
import { LogLevel, ScoutContextName } from "../types";

const SKIP_COMMANDS = new Set([
    "ping", "hello", "ismaster", "isMaster",
    "endSessions", "buildInfo", "getLastError",
]);

// Max in-flight entries; prevents unbounded growth when connections die without emitting commandFailed.
const MAX_IN_FLIGHT = 1000;

interface InFlightEntry {
    done: () => void;
    span: any;
    startedAt: number;
}

function scrubCommand(command: any): string {
    return JSON.stringify(command, (_key, value) => {
        if (value === null || typeof value !== "object") { return "?"; }
        return value;
    });
}

export class MongoDBIntegration extends RequireIntegration {
    protected readonly packageName: string = "mongodb";

    protected shim(mongoExport: any) {
        const OriginalMongoClient = mongoExport.MongoClient;
        if (!OriginalMongoClient || !OriginalMongoClient.prototype) { return mongoExport; }

        const integration = this;

        // MongoClient freezes its options object during construction, so monitorCommands
        // cannot be set after the fact. Use a Proxy construct trap to inject the flag
        // before parseOptions() runs, then attach the CommandMonitor listeners.
        const PatchedMongoClient = new Proxy(OriginalMongoClient, {
            construct(target: any, args: any[]) {
                const [url, options, ...rest] = args;
                const instance = new target(url, { ...options, monitorCommands: true }, ...rest);
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

    private attachCommandMonitor(client: any): void {
        const inFlight = new Map<string, InFlightEntry>();
        const integration = this;

        client.on("commandStarted", (event: any) => {
            if (!integration.scout) { return; }
            if (SKIP_COMMANDS.has(event.commandName)) { return; }

            if (inFlight.size >= MAX_IN_FLIGHT) {
                const oldestKey = inFlight.keys().next().value;
                if (oldestKey !== undefined) {
                    const entry = inFlight.get(oldestKey)!;
                    entry.done();
                    inFlight.delete(oldestKey);
                }
            }

            const key = `${event.connectionId}:${event.requestId}`;
            const collection = String(event.command[event.commandName] ?? "unknown");
            const op = `MongoDB/${collection}/${event.commandName}`;
            const stmt = scrubCommand(event.command);

            integration.scout.instrument(op, (done) => {
                const span = integration.scout ? integration.scout.getCurrentSpan() : null;
                if (span) {
                    span.addContext(ScoutContextName.DBStatement, stmt);
                }
                inFlight.set(key, { done, span, startedAt: Date.now() });
            });
        });

        client.on("commandSucceeded", (event: any) => {
            const key = `${event.connectionId}:${event.requestId}`;
            const entry = inFlight.get(key);
            if (!entry) { return; }
            inFlight.delete(key);

            integration.logFn(
                `[scout/integrations/mongodb] ${event.commandName} succeeded`,
                LogLevel.Trace,
            );

            entry.done();
        });

        client.on("commandFailed", (event: any) => {
            const key = `${event.connectionId}:${event.requestId}`;
            const entry = inFlight.get(key);
            if (!entry) { return; }
            inFlight.delete(key);

            if (entry.span) {
                entry.span.addContext(ScoutContextName.Error, "true");
            }

            integration.logFn(
                `[scout/integrations/mongodb] ${event.commandName} failed: ${event.failure}`,
                LogLevel.Trace,
            );

            entry.done();
        });
    }
}

export default new MongoDBIntegration();
