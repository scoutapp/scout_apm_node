import * as download from "download";
import * as path from "path";
import * as tmp from "tmp-promise";
import { Readable } from "stream";
import { mkdtemp, createReadStream } from "fs";
import { pathExists, readJson } from "fs-extra";

// tslint:disable-next-line no-var-requires
const hasha = require("hasha");

import { AgentDownloadOptions, CoreAgentVersion, AgentDownloader, AgentDownloadConfig } from "../types";
import * as Errors from "../errors";
import * as Constants from "../constants";
import DownloadConfigs from "../download-configs";

export class WebAgentDownloader implements AgentDownloader {
    /** @see AgentDownloader */
    public getDownloadConfigs(v: CoreAgentVersion): Promise<AgentDownloadConfig[]> {
        const rawVersion = v.raw;
        if (!(rawVersion in DownloadConfigs)) {
            return Promise.reject(new Errors.UnsupportedVersion(`Auto-download unsupported for [${rawVersion}]`));
        }

        return Promise.resolve(DownloadConfigs[rawVersion]);
    }

    /** @see AgentDownloader */
    public checkBinary(binPath: string, adc?: AgentDownloadConfig): Promise<boolean> {
        return hasha.fromFile(binPath, {algorithm: "sha256"})
            .then((hash: string) => {
                if (!hash) { throw new Errors.UnexpectedError(`Failed to hash file at path [${binPath}]`); }

                // If download config was not provided, find *any* matching version based on hardcoded manifest data
                if (!adc) { return this.matchesHardcodedVersionSHA256(hash); }

                // If a hardcoded manifest is not available, check for a manifest in the same folder
                if (!adc.manifest || !adc.manifest.core_agent_binary_sha256) {
                    const expectedManifestPath = path.join(path.dirname(binPath), "manifest.json");
                    return this.checkBinarySHA256AgainstManifest(hash, expectedManifestPath);
                }

                return hash === adc.manifest.core_agent_binary_sha256;
            });
    }

    /** @see AgentDownloader */
    public download(v: CoreAgentVersion, opts?: AgentDownloadOptions): Promise<string> {
        let config: AgentDownloadConfig;
        let expectedBinPath: string;
        let expectedManifestPath: string;

        // Retrieve the available download configurations
        return this.getDownloadConfigs(v)
            .then(configs => {
                if (!configs || !configs.length) {
                    throw new Errors.UnexpectedError(`No available download configurations for version [${v.raw}]`);
                }

                // Use the first available configuration
                config = configs[0];
                if (!config.url) {
                    throw new Errors.InvalidAgentDownloadConfig("URL is missing/invalid");
                }
            })
        // Create a temporary directory & download the agent
            .then(() => tmp.dir({prefix: Constants.TMP_DIR_PREFIX}))
            .then(result => {
                const dir = result.path;

                expectedBinPath = `${dir}/${Constants.CORE_AGENT_BIN_FILE_NAME}`;
                expectedManifestPath = `${dir}/${Constants.CORE_AGENT_MANIFEST_FILE_NAME}`;

                const options = {extract: config.zipped};
                return download(config.url, dir, options);
            })
        // Ensure file download succeeded
            .then(() => pathExists(expectedBinPath))
            .then(exists => {
                if (!exists) {
                    throw new Errors.UnexpectedError(
                        `Failed to download agent from [${config.url}] -> [${expectedBinPath}]`,
                    );
                }
            })
        // Check for & verify binary hash
            .then(() => this.checkBinary(expectedBinPath, config))
            .then(matches => {
                if (!matches) {
                    throw new Errors.UnexpectedError("Agent binary hash does not match expected value");
                }
            })
            .then(() => expectedBinPath);
    }

    /**
     * Check if a binary hash matches any hardcoded version
     *
     * @param {string} hash
     * @returns {Promise<boolean>} A promise that resolves to whether it matches or not
     */
    private matchesHardcodedVersionSHA256(hash: string): Promise<boolean> {
        // Attempt to find a matching binary from *some* matching version
        const matchExists = Object.values(DownloadConfigs)
            .some((configs: AgentDownloadConfig[]) => {
                return configs.some((c: AgentDownloadConfig) => {
                    if (!c || !c.manifest || !c.manifest.core_agent_binary_sha256) {
                        return false;
                    }

                    return c.manifest.core_agent_binary_sha256 === hash;
                });
            });

        return Promise.resolve(matchExists);
    }

    /**
     * Check a binary hash against a given manifest file (JSON)
     *
     * @param {string} hash - The hash of the binary
     * @param {string} manifestPath - Path to the manifest (usually same folder as the binary)
     * @returns {Promise<boolean>} A promise that resolves to whether the binary hash matches the manifest
     */
    private checkBinarySHA256AgainstManifest(sha256Hash: string, path: string): Promise<boolean> {
        // Read the manifest's JSON
        return readJson(path)
            .then(obj => {
                // If SHA256 hash doesn't match, fail
                if (!obj || !obj.core_agent_binary_sha256) {
                    return Promise.resolve(false);
                }

                return obj.core_agent_binary_sha256 === sha256Hash;
            });
    }

}

export default WebAgentDownloader;
