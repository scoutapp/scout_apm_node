import { RequireIntegration } from "../types/integrations";
export declare class PrismaIntegration extends RequireIntegration {
    protected readonly packageName: string;
    protected shim(prismaExport: any): any;
    private shimPrismaClient;
}
declare const _default: PrismaIntegration;
export default _default;
