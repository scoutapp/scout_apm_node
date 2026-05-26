import { RequireIntegration } from "../types/integrations";
export declare class IORedisIntegration extends RequireIntegration {
    protected readonly packageName: string;
    protected shim(ioredisExport: any): any;
    private shimSendCommand;
}
declare const _default: IORedisIntegration;
export default _default;
