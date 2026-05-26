import { RequireIntegration } from "../types/integrations";
export declare class RedisIntegration extends RequireIntegration {
    protected readonly packageName: string;
    protected shim(redisExport: any): any;
    private patchProto;
}
declare const _default: RedisIntegration;
export default _default;
