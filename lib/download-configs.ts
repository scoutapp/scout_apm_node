// tslint:disable max-line-length
import { AgentDownloadConfigs, PlatformTriple } from "./types";

export default {
    // Version 1.1.8
    "1.1.8": [
        {
            manifest: {
                core_agent_binary: "core-agent",
                core_agent_binary_sha256: "e2b93a7075a195755dc46fcee05096c27bcbfae92b8586b794541c529c16b1f2",
                core_agent_version: "1.1.8",
                version: "1.1.8",
            },
            platform: PlatformTriple.GNULinux64,
            rawVersion: "1.1.8",
            url: "https://s3-us-west-1.amazonaws.com/scout-public-downloads/apm_core_agent/release/scout_apm_core-v1.1.8-x86_64-unknown-linux-gnu.tgz",
            zipped: true,
        },
    ],

    // Version 1.2.4
    "1.2.4": [
        {
            manifest: {
                core_agent_binary: "core-agent",
                core_agent_binary_sha256: "0ccc089545d3bb8e1001cf29bd0d09b7b65e5cad53ff5988033dfc74faa061d5",
                core_agent_version: "1.2.4",
                version: "1.2.4",
            },
            platform: PlatformTriple.GNULinux64,
            rawVersion: "1.2.4",
            url: "https://s3-us-west-1.amazonaws.com/scout-public-downloads/apm_core_agent/release/scout_apm_core-v1.2.4-x86_64-unknown-linux-gnu.tgz",
            zipped: true,
        },
    ],

} as AgentDownloadConfigs;
