import { Scout } from "./scout";
import { ScoutConfiguration } from "./types";
import { ExportBag } from "./types/integrations";
export declare const EXPORT_BAG: ExportBag;
export declare function setGlobalScoutInstance(scout: Scout): void;
export declare function getGlobalScoutInstance(): Scout;
export declare function getOrCreateGlobalScoutInstance(config?: Partial<ScoutConfiguration>): Promise<Scout>;
