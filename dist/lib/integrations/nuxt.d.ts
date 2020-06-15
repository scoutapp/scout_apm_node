import { RequireIntegration } from "../types/integrations";
export declare class NuxtIntegration extends RequireIntegration {
    protected readonly packageName: string;
    protected shim(nuxtExport: any): any;
    /**
     * Shim for nuxt's `Nuxt` constructor
     *
     * @param {any} nuxtExport - nuxt's export
     */
    private shimNuxtCtor;
}
declare const _default: NuxtIntegration;
export default _default;
