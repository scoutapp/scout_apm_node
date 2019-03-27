export const DOMAIN_SOCKET_URI_SCHEME = "unix://";
export const DOMAIN_SOCKET_URI_SCHEME_RGX = /^unix:\/\//;
export const SUPPORTED_CORE_AGENT_VERSIONS = [
    "1.1.8",
];
export const TMP_DIR_PREFIX = "core-agent-dl-";
export const CORE_AGENT_BIN_FILE_NAME = "core-agent";
export const CORE_AGENT_MANIFEST_FILE_NAME = "manifest.json";
export const DEFAULT_BIN_STARTUP_WAIT_MS = 1000;
export const DEFAULT_CORE_AGENT_DOWNLOAD_CACHE_DIR = "/tmp/core-agent/downloads";
export const DEFAULT_REQUEST_PREFIX = "req-";
export const DEFAULT_SPAN_PREFIX = "span-";
export const DEFAULT_CONNECTION_POOL_OPTS = {
    autostart: true,
    max: 500,
    min: 10,
    testOnBorrow: true,
};
