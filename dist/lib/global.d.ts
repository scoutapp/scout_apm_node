import { Scout, ScoutOptions } from "./scout";
import { ScoutConfiguration } from "./types";
import { ExportBag } from "./types/integrations";
export declare const EXPORT_BAG: ExportBag;
/**
 * Set the active global scout instance
 *
 * @param {Scout} scout
 */
export declare function setActiveGlobalScoutInstance(scout: Scout): void;
/**
 * Get the current active global scout instance
 *
 * @returns {Scout | null} the active global scout instance if there is one
 */
export declare function getActiveGlobalScoutInstance(): Scout | null;
/**
 * Get or create the current active global scout instance
 *
 * @param {ScoutConfiguration} [config] - Scout configuration to use to create (if necessary)
 * @param {ScoutOptions} [opts] - options
 * @returns {Promise<Scout>} created or retrieved Scout instance
 */
export declare function getOrCreateActiveGlobalScoutInstance(config?: Partial<ScoutConfiguration>, opts?: ScoutOptions): Promise<Scout>;
/**
 * Shutdown the active global scout instance if there is one
 *
 * @returns {Promise<void>} A promise that resolves when the shutdown has completed
 */
export declare function shutdownActiveGlobalScoutInstance(): Promise<void>;
/**
 * Check if a given scout instance is the active global scout instance
 *
 * @param {Scout} scout
 * @returns {boolean} whether the scout is same instance
 */
export declare function isActiveGlobalScoutInstance(scout: Scout): boolean;
