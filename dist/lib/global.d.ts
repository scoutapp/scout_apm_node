import { Scout } from "./scout";
import { ScoutConfiguration } from "./types";
export declare function setGlobalScoutInstance(scout: Scout): void;
export declare function getGlobalScoutInstance(): Scout;
export declare function getOrCreateGlobalScoutInstance(config?: Partial<ScoutConfiguration>): Promise<Scout>;
