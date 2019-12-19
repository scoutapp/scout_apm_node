import { AgentManifest, HashDigests, CoreAgentVersion } from "./agent";
import { Platform, PlatformTriple } from "./enum";

export interface AgentDownloadConfigs {
    [k: string]: AgentDownloadConfig[];
}

export interface AgentDownloadOptions {
    // Whether or not to disable the cache
    disableCache?: boolean;

    // Directory to use for download cache, should either contain `core-agent`
    // or a subdirectory w/ the verison name
    cacheDir?: string;

    // Whether to update the cache
    updateCache?: boolean;

    // Disallow external downloads
    disallowDownload?: boolean;

    // Root URL to use for download (overrides default download URL provided by hardcorded download config)
    // ex. "https://s3-us-west-1.amazonaws.com/scout-public-downloads/apm_core_agent/release"
    downloadUrl?: string;

    // Filename to be combined wiht the Root URL to use for download (does *not* include the extension, i.e. '.tgz')
    // ex: "scout_apm_core-v1.1.8-x86_64-unknown-linux-gnu"
    coreAgentFullName?: string;

    // Directory into which core agent binaries will be downloaded
    // ex: "/tmp/scout_apm_core"
    coreAgentDir?: string;
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
