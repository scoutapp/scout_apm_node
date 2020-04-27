import { Scout, ScoutOptions } from "./scout";
import { ScoutConfiguration } from "./types";
import { ExportBag } from "./types/integrations";
export declare const EXPORT_BAG: ExportBag;
export declare function setActiveGlobalScoutInstance(scout: Scout): void;
export declare function getActiveGlobalScoutInstance(): Scout | null;
export declare function getOrCreateActiveGlobalScoutInstance(config?: Partial<ScoutConfiguration>, opts?: ScoutOptions): Promise<Scout>;
export declare function shutdownActiveGlobalScoutInstance(): Promise<void>;
export declare function isActiveGlobalScoutInstance(scout: Scout): boolean;
