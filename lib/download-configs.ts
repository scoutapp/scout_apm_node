import { AgentDownloadConfig, Platform } from "./types";

const DOWNLOAD_CONFIGS: {[k: string]: AgentDownloadConfig[]} = {
    "1.1.8": [
        {
            zipped: true,
            platform: Platform.GNULinux64,
            url: "https://s3-us-west-1.amazonaws.com/scout-public-downloads/apm_core_agent/release/scout_apm_core-v1.1.8-x86_64-unknown-linux-gnu.tgz",
            manifest: {
                version: "1.1.8",
                core_agent_version: "1.1.8",
                core_agent_binary: "core-agent",
                core_agent_binary_sha256: "e2b93a7075a195755dc46fcee05096c27bcbfae92b8586b794541c529c16b1f2",
            }
        }
    ]
};

export default DOWNLOAD_CONFIGS;
