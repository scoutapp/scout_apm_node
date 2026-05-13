"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaIntegration = void 0;
const integrations_1 = require("../types/integrations");
const types_1 = require("../types");
class PrismaIntegration extends integrations_1.RequireIntegration {
    constructor() {
        super(...arguments);
        this.packageName = "@prisma/client";
    }
    shim(prismaExport) {
        prismaExport = this.shimPrismaClient(prismaExport);
        return prismaExport;
    }
    shimPrismaClient(prismaExport) {
        const OriginalClient = prismaExport.PrismaClient;
        if (!OriginalClient) {
            return prismaExport;
        }
        const integration = this;
        class PatchedPrismaClient extends OriginalClient {
            constructor(...args) {
                super(...args);
                // $extends returns a new client; returning it from the constructor
                // makes `new PrismaClient()` yield the extended instance.
                return this.$extends({
                    query: {
                        $allModels: {
                            async $allOperations({ model, operation, args: queryArgs, query }) {
                                if (!integration.scout) {
                                    return query(queryArgs);
                                }
                                const op = types_1.ScoutSpanOperation.SQLQuery;
                                const stmt = `${model}.${operation}`;
                                return integration.scout.instrument(op, async (done) => {
                                    const span = integration.scout
                                        ? integration.scout.getCurrentSpan()
                                        : null;
                                    try {
                                        if (span) {
                                            await span.addContext(types_1.ScoutContextName.DBStatement, stmt);
                                        }
                                        const result = await query(queryArgs);
                                        done();
                                        integration.logFn(`[scout/integrations/prisma] ${stmt} completed`, types_1.LogLevel.Trace);
                                        return result;
                                    }
                                    catch (err) {
                                        done();
                                        if (span) {
                                            span.addContext(types_1.ScoutContextName.Error, "true");
                                        }
                                        throw err;
                                    }
                                });
                            },
                        },
                    },
                });
            }
        }
        prismaExport.PrismaClient = PatchedPrismaClient;
        return prismaExport;
    }
}
exports.PrismaIntegration = PrismaIntegration;
exports.default = new PrismaIntegration();
