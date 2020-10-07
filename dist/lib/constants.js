"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CORE_AGENT_VERSION = "v1.3.0";
exports.DOMAIN_SOCKET_URI_SCHEME_RGX = /^(unix|file):\/\//;
exports.TMP_DIR_PREFIX = "core-agent-dl-";
exports.CORE_AGENT_BIN_FILE_NAME = "core-agent";
exports.CORE_AGENT_MANIFEST_FILE_NAME = "manifest.json";
exports.DEFAULT_BIN_STARTUP_WAIT_MS = 1000;
exports.DEFAULT_CORE_AGENT_DOWNLOAD_CACHE_DIR = "/tmp/scout_apm_core";
exports.DEFAULT_REQUEST_PREFIX = "req-";
exports.DEFAULT_SPAN_PREFIX = "span-";
exports.DEFAULT_CONNECTION_POOL_OPTS = {
    max: 500,
    min: 0,
    testOnBorrow: true,
};
exports.SECOND_MS = 1000;
exports.MINUTE_MS = 60 * exports.SECOND_MS;
exports.AGENT_BUFFER_TIME_MS = 2 * exports.MINUTE_MS;
exports.DEFAULT_EXPRESS_REQUEST_TIMEOUT_MS = 5 * exports.MINUTE_MS;
exports.DEFAULT_SOCKET_FILE_NAME = "core-agent.sock";
exports.DEFAULT_CORE_AGENT_NAME = "scout_apm_core";
exports.SCOUT_PATH_TAG = "path";
// Common parameters to filter, copied from scout_apm_python
exports.DEFAULT_PARAM_FILTER_LOOKUP = {
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
exports.DEFAULT_PARAM_SCRUB_REPLACEMENT = "[FILTERED]";
exports.DEFAULT_SLOW_REQUEST_THRESHOLD_MS = exports.SECOND_MS / 2;
exports.DEFAULT_SOCKET_TIMEOUT_MS = 60 * exports.SECOND_MS;
exports.DEFAULT_AGENT_SEND_TIMEOUT_MS = 10000;
exports.CORE_AGENT_TCP_SOCKET_MIN_VERSION = "1.3.0";
