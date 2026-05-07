"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IORedisIntegration = void 0;
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
class IORedisIntegration extends integrations_1.RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "ioredis";
    }
    shim(ioredisExport) {
        ioredisExport = this.shimSendCommand(ioredisExport);
        return ioredisExport;
    }
    shimSendCommand(ioredisExport) {
        // ioredis v5 exports as default; v4 exports directly
        const Redis = ioredisExport.default || ioredisExport;
        if (!Redis || !Redis.prototype) {
            return ioredisExport;
        }
        const originalSendCommand = Redis.prototype.sendCommand;
        if (!originalSendCommand) {
            return ioredisExport;
        }
        const integration = this;
        Redis.prototype.sendCommand = function (command, ...rest) {
            if (!integration.scout || !command) {
                return originalSendCommand.apply(this, [command, ...rest]);
            }
            const commandName = (command.name || "command").toUpperCase();
            const op = `Cache/${commandName}`;
            return integration.scout.instrument(op, done => {
                if (!integration.scout) {
                    return originalSendCommand.apply(this, [command, ...rest]).then(() => done());
                }
                const span = integration.scout.getCurrentSpan();
                // Store command name + first arg (key), never the value
                const args = Array.isArray(command.args) ? command.args : [];
                const stmt = args.length > 0 ? `${commandName} ${args[0]}` : commandName;
                let result;
                return originalSendCommand.apply(this, [command, ...rest])
                    .then((r) => { result = r; })
                    .then(() => span ? span.addContext(types_1.ScoutContextName.DBStatement, stmt) : Promise.resolve())
                    .then(() => done())
                    .then(() => {
                    integration.logFn(`[scout/integrations/ioredis] ${commandName} completed`, types_1.LogLevel.Trace);
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
        return ioredisExport;
    }
}
exports.IORedisIntegration = IORedisIntegration;
exports.default = new IORedisIntegration();
