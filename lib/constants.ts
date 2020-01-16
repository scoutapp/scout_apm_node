export const DEFAULT_CORE_AGENT_VERSION = "v1.2.7";
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
export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const AGENT_BUFFER_TIME_MS = 2 * MINUTE_MS;
export const DEFAULT_EXPRESS_REQUEST_TIMEOUT_MS = 5 * MINUTE_MS;

export const DEFAULT_SOCKET_FILE_NAME = "core-agent.sock";
export const DEFAULT_CORE_AGENT_NAME = "scout_apm_core";

export const SCOUT_PATH_TAG = "path";

// Common parameters to filter, copied from scout_apm_python
export const DEFAULT_PARAM_FILTER_LOOKUP = {
    "access": true,
    "access_token": true,
    "api_key": true,
    "apikey": true,
    "auth": true,
    "auth_token": true,
    "card[number]": true,
    "certificate": true,
    "credentials": true,
    "crypt": true,
    "key": true,
    "mysql_pwd": true,
    "otp": true,
    "passwd": true,
    "password": true,
    "private": true,
    "protected": true,
    "salt": true,
    "secret": true,
    "ssn": true,
    "stripetoken": true,
    "token": true,
};

export const DEFAULT_PARAM_SCRUB_REPLACEMENT = "[FILTERED]";

export const DEFAULT_SLOW_REQUEST_THRESHOLD_MS = SECOND_MS / 2;

export const SCOUT_SQL_QUERY = "SQL/Query";
