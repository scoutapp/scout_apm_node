export const DOMAIN_SOCKET_URI_SCHEME_RGX = /^(unix|file):\/\//;
export const TMP_DIR_PREFIX = "core-agent-dl-";
export const CORE_AGENT_BIN_FILE_NAME = "core-agent";
export const CORE_AGENT_MANIFEST_FILE_NAME = "manifest.json";
export const DEFAULT_BIN_STARTUP_WAIT_MS = 1000;
export const DEFAULT_CORE_AGENT_DOWNLOAD_CACHE_DIR = "/tmp/core-agent/downloads";
export const DEFAULT_REQUEST_PREFIX = "req-";
export const DEFAULT_SPAN_PREFIX = "span-";
export const DEFAULT_CONNECTION_POOL_OPTS = {
    max: 500,
    min: 0,
    testOnBorrow: true,
};
export const MINUTE_MS = 60000;
export const AGENT_BUFFER_TIME_MS = 2 * MINUTE_MS;
export const DEFAULT_EXPRESS_REQUEST_TIMEOUT_MS = 5 * MINUTE_MS;

export const DEFAULT_SOCKET_FILE_NAME = "scout-agent.sock";
export const DEFAULT_CORE_AGENT_NAME = "scout_apm_core";
