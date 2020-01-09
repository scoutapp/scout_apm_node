import { Scout } from "../scout";
export const scoutIntegrationSymbol = Symbol("scout");

export interface ExportBag {
    [key: string]: any;
}

export interface RequireIntegration {
    /**
     * Name of the package that the require integration is for
     */
    getPackageName: () => string;

    /**
     * Function that takes an export bag to append modified exports on to (by name)
     * it normally runs the require-in-the-middle Hook(), to make the necessary shims
     */
    ritmHook: (exportBag: ExportBag) => void;

    /**
     * Set the scout instance for the integration
     *
     */
    setScoutInstance: (instance: Scout) => void;
}

export const doNothingRequireIntegration = {
    packageName: "",
    ritmHook: () => undefined,
};
