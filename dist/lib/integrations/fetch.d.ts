import { RequireIntegration, ExportBag } from "../types/integrations";
export declare class FetchIntegration extends RequireIntegration {
    protected readonly packageName: string;
    private subscribed;
    private readonly pending;
    ritmHook(exportBag: ExportBag): void;
    protected shim(e: any): any;
    private subscribe;
}
declare const _default: FetchIntegration;
export default _default;
