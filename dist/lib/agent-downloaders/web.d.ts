import { AgentDownloadConfig, AgentDownloadOptions, AgentDownloader, CoreAgentVersion, LogFn } from "../types";
export declare class WebAgentDownloader implements AgentDownloader {
    private logFn;
    constructor(opts?: {
        logFn: LogFn;
    });
    /** @see AgentDownloader */
    getDownloadConfigs(v: CoreAgentVersion): Promise<AgentDownloadConfig[]>;
    /** @see AgentDownloader */
    checkBinary(binPath: string, adc?: AgentDownloadConfig): Promise<boolean>;
    /** @see AgentDownloader */
    download(v: CoreAgentVersion, opts?: AgentDownloadOptions): Promise<string>;
    /**
     * Download from a custom path
     *
     * @param {CoreAgentVersion} v - Version of the agent we're going to be downloading
     * @param {AgentDownloadOptions} [opts]
     * @returns {string} Path to the downloaded binary
     */
    private downloadFromCustomPath;
    /**
     * Retrieve a cached binary from a given base directory
     * (either core-agent binary is @  `dir/<version>/core-agent` or `dir/core-agent`
     *
     * @param {string} baseDir - Directory in which to search
     * @param {CoreAgentVersion} v - Version to search for & validate
     * @param {AgentDownloadConfig} adc - Agent download config (used for checking manifest)
     * @returns {Promise<string>} A promise that resolves to a valid cached binary (if found)
     */
    private getCachedBinaryPath;
    /**
     * Download a given version of the core-agent binary using local download configuration
     *
     * @param {CoreAgentVersion} v - The version to download
     * @param {AgentDownloadOptions} [opts] - Options to control download
     * @returns {string} Path to the downloaded binary
     */
    private downloadFromConfig;
    /**
     * Ensure that a given binary is valid
     *
     * @param {string} binPath - path to the binary
     * @param {AgentDownloadConfig} [adc] - agent download config (for checking manifest)
     * @returns {Promise<string>} A promise that resolves to the given path iff the binary is valid
     */
    private ensureBinary;
    /**
     * Check if a binary hash matches any hardcoded version
     *
     * @param {string} hash
     * @returns {Promise<boolean>} A promise that resolves to whether it matches or not
     */
    private matchesHardcodedVersionSHA256;
    /**
     * Update the on-disk cache with a download dir
     *
     * @param {string} downloadDir - The directory to which a download was performed
     * @param {AgentDownloadConfig} adc - Download configuration
     * @param {AgnetDownloadOptions} opts - Options used during download
     * @returns {Promise<string>} A promise that resolves to the binary path inside the cache
     */
    private updateCacheWithDownloadDir;
    /**
     * Check a binary hash against a given manifest file (JSON)
     *
     * @param {string} hash - The hash of the binary
     * @param {string} manifestPath - Path to the manifest (usually same folder as the binary)
     * @returns {Promise<boolean>} A promise that resolves to whether the binary hash matches the manifest
     */
    private checkBinarySHA256AgainstManifest;
}
export default WebAgentDownloader;
