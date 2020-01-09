export const scoutIntegrationSymbol = Symbol("scout");

export interface ExportBag {
    [key: string]: any;
}

export interface RequireIntegration {
    /**
     * Function that takes an export bag to append modified exports on to (by name)
     * it normally runs the require-in-the-middle Hook(), to make the necessary shims
     */
    ritmHook: (exportBag: ExportBag) => void;
}
