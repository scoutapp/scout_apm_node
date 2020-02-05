"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const download = require("download");
const path = require("path");
const tmp = require("tmp-promise");
const types_1 = require("../types");
const fs = require("fs-extra");
// tslint:disable-next-line no-var-requires
const hasha = require("hasha");
const PLATFORM = types_1.detectPlatformTriple();
const types_2 = require("../types");
const Errors = require("../errors");
const Constants = require("../constants");
const download_configs_1 = require("../download-configs");
class WebAgentDownloader {
    constructor(opts) {
        this.logFn = opts && opts.logFn ? opts.logFn : () => undefined;
    }
    /** @see AgentDownloader */
    getDownloadConfigs(v) {
        const rawVersion = v.raw;
        if (!(rawVersion in download_configs_1.default)) {
            return Promise.reject(new Errors.UnsupportedVersion(`Auto-download unsupported for [${rawVersion}]`));
        }
        return Promise.resolve(download_configs_1.default[rawVersion]);
    }
    /** @see AgentDownloader */
    checkBinary(binPath, adc) {
        return hasha.fromFile(binPath, { algorithm: "sha256" })
            .then((hash) => {
            if (!hash) {
                throw new Errors.UnexpectedError(`Failed to hash file at path [${binPath}]`);
            }
            // If download config was not provided, find *any* matching version based on hardcoded manifest data
            if (!adc) {
                return this.matchesHardcodedVersionSHA256(hash);
            }
            // If a hardcoded manifest is not available, check for a manifest in the same folder
            if (!adc.manifest || !adc.manifest.core_agent_binary_sha256) {
                const expectedManifestPath = path.join(path.dirname(binPath), "manifest.json");
                return this.checkBinarySHA256AgainstManifest(hash, expectedManifestPath);
            }
            return hash === adc.manifest.core_agent_binary_sha256;
        });
    }
    /** @see AgentDownloader */
    download(v, opts) {
        // Normally we'd look up the version from the hard-coded known configs
        let doDownload = () => this.downloadFromConfig(v, opts);
        // If a custom download URL is specified, then use that
        // if not, look up the version from the hard-coded configs
        if (opts && opts.downloadUrl && opts.coreAgentFullName && opts.coreAgentDir) {
            doDownload = () => this.downloadFromCustomPath(v, opts);
        }
        // Use cache if available & populated, otherwise do download
        if (opts && !opts.disableCache && opts.cacheDir) {
            return this.getCachedBinaryPath(opts.cacheDir, v)
                .catch(() => doDownload());
        }
        // Do regular download (without trying cache first)
        return doDownload();
    }
    /**
     * Download from a custom path
     *
     * @param {CoreAgentVersion} v - Version of the agent we're going to be downloading
     * @param {AgentDownloadOptions} [opts]
     * @returns {string} Path to the downloaded binary
     */
    downloadFromCustomPath(v, opts) {
        const url = `${opts.downloadUrl}/${opts.coreAgentFullName}.tgz`;
        const downloadDir = `${opts.coreAgentDir}`;
        const expectedBinPath = `${downloadDir}/${Constants.CORE_AGENT_BIN_FILE_NAME}`;
        // Ensure we're not attempting to do a download if they're disallowed
        if (opts && opts.disallowDownload) {
            throw new Errors.ExternalDownloadDisallowed();
        }
        // check if file has already been downloaded
        this.logFn(`[scout/agent-downloader/web] Checking for existing file @ [${expectedBinPath}]`, types_2.LogLevel.Debug);
        return fs.pathExists(expectedBinPath)
            .then(binExists => {
            if (binExists) {
                return expectedBinPath;
            }
            // Perform download
            this.logFn(`[scout/agent-downloader/web] Downloading from URL [${url}]`, types_2.LogLevel.Debug);
            return download(url, downloadDir, { extract: true })
                // Ensure file download succeeded
                .then(() => fs.pathExists(expectedBinPath))
                .then(exists => {
                if (!exists) {
                    throw new Errors.UnexpectedError(`Failed to download agent from [${url}] -> [${expectedBinPath}]`);
                }
                return expectedBinPath;
            });
        });
    }
    /**
     * Retrieve a cached binary from a given base directory
     * (either core-agent binary is @  `dir/<version>/core-agent` or `dir/core-agent`
     *
     * @param {string} baseDir - Directory in which to search
     * @param {CoreAgentVersion} v - Version to search for & validate
     * @param {AgentDownloadConfig} adc - Agent download config (used for checking manifest)
     * @returns {Promise<string>} A promise that resolves to a valid cached binary (if found)
     */
    getCachedBinaryPath(baseDir, v, adc) {
        const versionedPath = path.join(baseDir, v.raw, Constants.CORE_AGENT_BIN_FILE_NAME);
        const inDirPath = path.join(baseDir, Constants.CORE_AGENT_BIN_FILE_NAME);
        return Promise.all([
            fs.pathExists(versionedPath),
            fs.pathExists(inDirPath),
        ])
            .then(([versionedPathExists, inDirPathExists]) => {
            if (!versionedPathExists && !inDirPathExists) {
                throw new Errors.UnexpectedError("Failed to find cached download");
            }
            const path = versionedPathExists ? versionedPath : inDirPath;
            return this.ensureBinary(path, adc);
        });
    }
    /**
     * Download a given version of the core-agent binary using local download configuration
     *
     * @param {CoreAgentVersion} v - The version to download
     * @param {AgentDownloadOptions} [opts] - Options to control download
     * @returns {string} Path to the downloaded binary
     */
    downloadFromConfig(v, opts) {
        let expectedBinPath;
        let downloadDir;
        let adc;
        // Retrieve the hard-coded download config for the given version
        return this.getDownloadConfigs(v)
            .then(configs => {
            if (!configs || !configs.length) {
                throw new Errors.UnexpectedError(`No available download configurations for version [${v.raw}]`);
            }
            // Find the configuration that matches the detected platform triple
            const foundConfig = configs.find(c => c.platform === PLATFORM);
            if (!foundConfig) {
                throw new Errors.InvalidAgentDownloadConfig(`no config for detected platform [${PLATFORM}]`);
            }
            adc = foundConfig;
            if (!adc.url) {
                throw new Errors.InvalidAgentDownloadConfig("URL is missing/invalid");
            }
        })
            // Create a temporary directory & download the agent
            .then(() => tmp.dir({ prefix: Constants.TMP_DIR_PREFIX }))
            .then(result => {
            downloadDir = result.path;
            expectedBinPath = `${downloadDir}/${Constants.CORE_AGENT_BIN_FILE_NAME}`;
            const options = { extract: adc.zipped };
            // Ensure we're not attempting to do a download if they're disallowed
            if (opts && opts.disallowDownload) {
                throw new Errors.ExternalDownloadDisallowed();
            }
            return download(adc.url, downloadDir, options);
        })
            // Ensure file download succeeded
            .then(() => fs.pathExists(expectedBinPath))
            .then(exists => {
            if (!exists) {
                throw new Errors.UnexpectedError(`Failed to download agent from [${adc.url}] -> [${expectedBinPath}]`);
            }
        })
            // Check for & verify binary hash
            .then(() => {
            if (opts && opts.checkBinarySHA) {
                this.ensureBinary(expectedBinPath, adc);
            }
        })
            // Update the on-disk cache if cache is being used
            .then(() => {
            if (opts && opts.cacheDir && opts.updateCache) {
                return this.updateCacheWithDownloadDir(downloadDir, adc, opts);
            }
            // If cache wasn't used then return the tmp dir derived path
            return Promise.resolve(expectedBinPath);
        });
    }
    /**
     * Ensure that a given binary is valid
     *
     * @param {string} binPath - path to the binary
     * @param {AgentDownloadConfig} [adc] - agent download config (for checking manifest)
     * @returns {Promise<string>} A promise that resolves to the given path iff the binary is valid
     */
    ensureBinary(binPath, adc) {
        return this.checkBinary(binPath, adc)
            .then(matches => {
            if (!matches) {
                throw new Errors.UnexpectedError("Agent binary hash does not match expected value");
            }
            return binPath;
        });
    }
    /**
     * Check if a binary hash matches any hardcoded version
     *
     * @param {string} hash
     * @returns {Promise<boolean>} A promise that resolves to whether it matches or not
     */
    matchesHardcodedVersionSHA256(hash) {
        // Attempt to find a matching binary from *some* matching version
        const matchExists = Object.values(download_configs_1.default)
            .some((configs) => {
            return configs.some((c) => {
                if (!c || !c.manifest || !c.manifest.core_agent_binary_sha256) {
                    return false;
                }
                return c.manifest.core_agent_binary_sha256 === hash;
            });
        });
        return Promise.resolve(matchExists);
    }
    /**
     * Update the on-disk cache with a download dir
     *
     * @param {string} downloadDir - The directory to which a download was performed
     * @param {AgentDownloadConfig} adc - Download configuration
     * @param {AgnetDownloadOptions} opts - Options used during download
     * @returns {Promise<string>} A promise that resolves to the binary path inside the cache
     */
    updateCacheWithDownloadDir(downloadDir, adc, opts) {
        if (!opts.cacheDir || !opts.updateCache) {
            return Promise.reject(new Errors.UnexpectedError("not configured to use cache"));
        }
        const dest = path.join(opts.cacheDir, adc.rawVersion);
        return fs.ensureDir(dest)
            .then(() => fs.pathExists(downloadDir))
            .then(exists => {
            if (!exists) {
                throw new Errors.UnexpectedError(`download directory [${downloadDir}] is missing`);
            }
        })
            .then(() => fs.copy(downloadDir, dest))
            .then(() => path.join(dest, Constants.CORE_AGENT_BIN_FILE_NAME));
    }
    /**
     * Check a binary hash against a given manifest file (JSON)
     *
     * @param {string} hash - The hash of the binary
     * @param {string} manifestPath - Path to the manifest (usually same folder as the binary)
     * @returns {Promise<boolean>} A promise that resolves to whether the binary hash matches the manifest
     */
    checkBinarySHA256AgainstManifest(sha256Hash, path) {
        // Read the manifest's JSON
        return fs.readJson(path)
            .then(obj => {
            // If SHA256 hash doesn't match, fail
            if (!obj || !obj.core_agent_binary_sha256) {
                return Promise.resolve(false);
            }
            return obj.core_agent_binary_sha256 === sha256Hash;
        });
    }
}
exports.WebAgentDownloader = WebAgentDownloader;
exports.default = WebAgentDownloader;
