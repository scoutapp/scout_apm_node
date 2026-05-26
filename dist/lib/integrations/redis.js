"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisIntegration = void 0;
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
// String key avoids TypeScript symbol-indexing friction across proto chain
const PROTO_PATCHED = "__scout_redis_patched__";
class RedisIntegration extends integrations_1.RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "redis";
    }
    shim(redisExport) {
        const originalCreateClient = redisExport.createClient;
        if (typeof originalCreateClient !== "function") {
            return redisExport;
        }
        const integration = this;
        redisExport.createClient = function (...args) {
            const client = originalCreateClient.apply(this, args);
            integration.patchProto(client);
            return client;
        };
        return redisExport;
    }
    // Walk the prototype chain to find the object that owns sendCommand and patch it once.
    // In v4 it lives at depth 1; in v5.0–5.11 at depth 2; in v5.12+ it's wrapped by trace()
    // but the prototype location is still depth 2. All versions have the same call signature:
    //   sendCommand(args: string[], options?)
    // where args[0] is the command name and args[1] (if present) is the key.
    patchProto(client) {
        let proto = Object.getPrototypeOf(client);
        while (proto) {
            if (Object.getOwnPropertyDescriptor(proto, "sendCommand")) {
                if (proto[PROTO_PATCHED]) {
                    return;
                }
                proto[PROTO_PATCHED] = true;
                const originalSendCommand = proto.sendCommand;
                const integration = this;
                proto.sendCommand = function (cmdArgs, opts) {
                    if (!integration.scout || !Array.isArray(cmdArgs) || cmdArgs.length === 0) {
                        return originalSendCommand.apply(this, [cmdArgs, opts]);
                    }
                    const commandName = String(cmdArgs[0]).toUpperCase();
                    const op = `Redis/${commandName}`;
                    // command + key only — never expose the value
                    const stmt = cmdArgs.length > 1
                        ? `${commandName} ${String(cmdArgs[1])}`
                        : commandName;
                    return integration.scout.instrument(op, (done) => {
                        if (!integration.scout) {
                            return originalSendCommand.apply(this, [cmdArgs, opts]).then(() => done());
                        }
                        const span = integration.scout.getCurrentSpan();
                        let result;
                        return originalSendCommand.apply(this, [cmdArgs, opts])
                            .then((r) => { result = r; })
                            .then(() => span
                            ? span.addContext(types_1.ScoutContextName.DBStatement, stmt)
                            : Promise.resolve())
                            .then(() => done())
                            .then(() => {
                            integration.logFn(`[scout/integrations/redis] ${commandName} completed`, types_1.LogLevel.Trace);
                            return result;
                        })
                            .catch((err) => {
                            done();
                            if (span) {
                                span.addContext(types_1.ScoutContextName.Error, "true");
                            }
                            throw err;
                        });
                    });
                };
                return;
            }
            proto = Object.getPrototypeOf(proto);
        }
    }
}
exports.RedisIntegration = RedisIntegration;
exports.default = new RedisIntegration();
