import { Readable } from "stream";
import * as download from "download";
import { mkdtemp, createReadStream } from "fs";
import { pathExists } from "fs-extra";
import { basename } from "path";
import hasha from "hasha";

import { AgentDownloadOptions, CoreAgentVersion, AgentDownloader, AgentDownloadConfig } from "../types";
import * as Errors from "../errors";
import * as Constants from "../constants";
import DownloadConfigs from "../download-configs";

function makeTempDir(prefix: string): Promise<string> {
    return new Promise((resolve, reject) => {
        return mkdtemp(prefix, (err, folder) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(folder);
        });
    });
}

class WebAgentDownloader implements AgentDownloader {
    public getDownloadConfigs(v: CoreAgentVersion): Promise<AgentDownloadConfig[]> {
        const version = v.version;
        if (!(version in DownloadConfigs)) {
            return Promise.reject(new Errors.UnsupportedVersion(`Auto-download unsupported for [${version}]`));
        }

        return Promise.resolve(DownloadConfigs[version]);
    }

    public checkBinary(path: string, adc: AgentDownloadConfig): Promise<boolean> {
        if (!adc.manifest || !adc.manifest.core_agent_binary_sha256) {
            return Promise.reject(new Errors.UnexpectedError("Missing/invalid manifest in AgentDownloadConfig"));
        }

        const shasum = adc.manifest.core_agent_binary_sha256;
        // TODO: if agent download config doesn't contain manifest,
        // & manifest.json is present in the same directory, use it

        return hasha.fromFile(path, {algorithm: "sha256"})
            .then(hash => hash === shasum);
    }

    public download(v: CoreAgentVersion, opts: AgentDownloadOptions): Promise<string> {
        let config: AgentDownloadConfig;
        let expectedBinPath: string;
        let expectedManifestPath: string;

        // Retrieve the available download configurations
        return this.getDownloadConfigs(v)
            .then(configs => {
                if (!configs || !configs.length) {
                    throw new Errors.UnexpectedError(`No available download configurations for version [${v.version}]`);
                }

                // Use the first available configuration
                config = configs[0];
                if (!config.url) {
                    throw new Errors.InvalidAgentDownloadConfig("URL is missing/invalid");
                }
            })
        // Create a temporary directory & download the agent
            .then(() => makeTempDir(Constants.TMP_DIR_PREFIX))
            .then(tmpdir => {
                expectedBinPath = `${tmpdir}/${Constants.CORE_AGENT_BIN_FILE_NAME}`;
                expectedManifestPath = `${tmpdir}/${Constants.CORE_AGENT_MANIFEST_FILE_NAME}`;

                const options = {extract: config.zipped};
                return download(config.url, tmpdir, options);
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
}
