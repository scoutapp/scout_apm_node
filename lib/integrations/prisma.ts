import { RequireIntegration } from "../types/integrations";
import { LogLevel, ScoutContextName, ScoutSpanOperation } from "../types";

export class PrismaIntegration extends RequireIntegration {
    protected readonly packageName: string = "@prisma/client";

    protected shim(prismaExport: any) {
        prismaExport = this.shimPrismaClient(prismaExport);
        return prismaExport;
    }

    private shimPrismaClient(prismaExport: any): any {
        const OriginalClient = prismaExport.PrismaClient;
        if (!OriginalClient) { return prismaExport; }

        const integration = this;

        class PatchedPrismaClient extends OriginalClient {
            constructor(...args: any[]) {
                super(...args);
                // $extends returns a new client; returning it from the constructor
                // makes `new PrismaClient()` yield the extended instance.
                return (this as any).$extends({
                    query: {
                        $allModels: {
                            async $allOperations({ model, operation, args: queryArgs, query }: {
                                model: string;
                                operation: string;
                                args: any;
                                query: (args: any) => Promise<any>;
                            }) {
                                if (!integration.scout) {
                                    return query(queryArgs);
                                }

                                const op = ScoutSpanOperation.SQLQuery;
                                const stmt = `${model}.${operation}`;

                                return integration.scout.instrument(op, async (done: () => void) => {
                                    const span = integration.scout
                                        ? integration.scout.getCurrentSpan()
                                        : null;

                                    try {
                                        if (span) {
                                            await span.addContext(ScoutContextName.DBStatement, stmt);
                                        }
                                        const result = await query(queryArgs);
                                        done();
                                        integration.logFn(
                                            `[scout/integrations/prisma] ${stmt} completed`,
                                            LogLevel.Trace,
                                        );
                                        return result;
                                    } catch (err: any) {
                                        done();
                                        if (span) {
                                            span.addContext(ScoutContextName.Error, "true");
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

export default new PrismaIntegration();
