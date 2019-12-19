import { AgentDownloadConfigs, PlatformTriple } from "./types";

// tslint:disable no-var-requires
// The download-configs.json file should be generated using .dev/scripts/generate-download-configs
const downloadConfigs: AgentDownloadConfigs = require("./download-configs.json");

export default downloadConfigs;
