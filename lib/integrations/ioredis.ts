import { RequireIntegration } from "../types/integrations";
import { LogLevel, ScoutContextName } from "../types";

export class IORedisIntegration extends RequireIntegration {
    protected readonly packageName: string = "ioredis";

    protected shim(ioredisExport: any) {
        ioredisExport = this.shimSendCommand(ioredisExport);
        return ioredisExport;
    }

    private shimSendCommand(ioredisExport: any): any {
        // ioredis v5 exports as default; v4 exports directly
        const Redis = ioredisExport.default || ioredisExport;
        if (!Redis || !Redis.prototype) { return ioredisExport; }

        const originalSendCommand = Redis.prototype.sendCommand;
        if (!originalSendCommand) { return ioredisExport; }

        const integration = this;

        Redis.prototype.sendCommand = function(command: any, ...rest: any[]) {
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
                const args: string[] = Array.isArray(command.args) ? command.args : [];
                const stmt = args.length > 0 ? `${commandName} ${args[0]}` : commandName;

                let result: any;
                return originalSendCommand.apply(this, [command, ...rest])
                    .then((r: any) => { result = r; })
                    .then(() => span ? span.addContext(ScoutContextName.DBStatement, stmt) : Promise.resolve())
                    .then(() => done())
                    .then(() => {
                        integration.logFn(`[scout/integrations/ioredis] ${commandName} completed`, LogLevel.Trace);
                        return result;
                    })
                    .catch((err: any) => {
                        done();
                        if (span) { span.addContext(ScoutContextName.Error, "true"); }
                        throw err;
                    });
            });
        };

        return ioredisExport;
    }
}

export default new IORedisIntegration();
