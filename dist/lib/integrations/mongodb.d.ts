import { RequireIntegration } from "../types/integrations";
export declare class MongoDBIntegration extends RequireIntegration {
    protected readonly packageName: string;
    protected shim(mongoExport: any): any;
    private attachCommandMonitor;
}
declare const _default: MongoDBIntegration;
export default _default;
