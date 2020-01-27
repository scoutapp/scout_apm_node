import { AgentManifest, HashDigests, CoreAgentVersion } from "./agent";
import { PlatformTriple } from "./enum";
export interface AgentDownloadConfigs {
    [k: string]: AgentDownloadConfig[];
}
export interface AgentDownloadOptions {
    disableCache?: boolean;
    cacheDir?: string;
    updateCache?: boolean;
    disallowDownload?: boolean;
    downloadUrl?: string;
    coreAgentFullName?: string;
    coreAgentDir?: string;
    checkBinarySHA?: boolean;
}
export interface AgentDownloader {
    /**
     * Retrieve download configurations for given version
     *
     * @param {CoreAgentVersion} v - intended version
     * @returns {Promise<AgentDownloadConfig[]>} One or more download configurations for the given version
     */
    getDownloadConfigs(v: CoreAgentVersion): Promise<AgentDownloadConfig[]>;
    /**
     * Verify a binary at a given path.
     *
     * @param {string} path - Path to the binary
     * @param {AgentDownloadConfig} adc? - The agent download configuration used
     * @returns {Promise<boolean>} Whether the binary is valid or not
     */
    checkBinary(path: string, adc?: AgentDownloadConfig): Promise<boolean>;
    /**
     * Download & verify the core-agent binary
     * @param {AgentDownloadConfig} config - Config for downloading the agent (url, hash, expected manifest, etc)
     * @param {AgentDownloadOptions} opts - Options for download the agent
     * @returns {string} The path the downloaded & verified binary
     */
    download(v: CoreAgentVersion, opts: AgentDownloadOptions): Promise<string>;
}
export interface AgentDownloadConfig {
    url: string;
    rawVersion: string;
    zipped: boolean;
    platform: PlatformTriple;
    hash?: HashDigests;
    manifest?: AgentManifest;
}
