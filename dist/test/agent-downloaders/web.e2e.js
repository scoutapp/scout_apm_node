"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tape_1 = __importDefault(require("tape"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs-extra"));
const tmp = __importStar(require("tmp-promise"));
const Constants = __importStar(require("../../lib/constants"));
const types_1 = require("../../lib/types");
const web_1 = require("../../lib/agent-downloaders/web");
(0, tape_1.default)("download works (v1.1.8)", t => {
    const downloader = new web_1.WebAgentDownloader();
    const version = new types_1.CoreAgentVersion("1.1.8");
    downloader
        .download(version)
        .then(path => t.assert(path, `binary path is non-null (${path})`))
        .then(() => t.end())
        .catch(t.end);
});
(0, tape_1.default)("cache is updated by download (v1.1.8)", t => {
    const opts = {
        cacheDir: Constants.DEFAULT_CORE_AGENT_DOWNLOAD_CACHE_DIR,
        updateCache: true,
    };
    const downloader = new web_1.WebAgentDownloader();
    const version = new types_1.CoreAgentVersion("1.1.8");
    let subdir = `scout_apm_core-v${version.raw}`;
    let expectedDirPath;
    let expectedBinPath;
    (0, types_1.detectPlatformTriple)()
        .then(platform => subdir = `${subdir}-${platform}`)
        .then(() => downloader.download(version, opts))
        .then(() => {
        // The cache should have created a versioned path to the binary
        expectedDirPath = path.join(Constants.DEFAULT_CORE_AGENT_DOWNLOAD_CACHE_DIR, subdir);
        expectedBinPath = path.join(expectedDirPath, Constants.CORE_AGENT_BIN_FILE_NAME);
    })
        .then(() => Promise.all([
        fs.pathExists(expectedDirPath),
        fs.pathExists(expectedBinPath),
    ]))
        .then(([dirExists, binExists]) => {
        t.assert(dirExists, `expected cache dir [${expectedDirPath}] was populated`);
        t.assert(binExists, `expected cache binary path [${expectedBinPath}] was populated`);
    })
        .then(() => t.end())
        .catch(t.end);
});
(0, tape_1.default)("cache is used by second download (v1.1.8)", t => {
    const downloader = new web_1.WebAgentDownloader();
    const version = new types_1.CoreAgentVersion("1.1.8");
    const opts = { updateCache: true };
    let generatedCacheDir;
    // Create a temporary directory for opts to use
    // this ensure tests don't collide
    tmp.dir({ prefix: "core-agent-web-dl-cache-test" })
        .then(result => {
        generatedCacheDir = result.path;
        opts.cacheDir = generatedCacheDir;
    })
        // Download once, populating the cache
        .then(() => downloader.download(version, opts))
        .then(path => t.assert(path, "first download worked (should update cache)"))
        // Download again, but disallow external downloads
        .then(() => {
        opts.disallowDownload = true;
        // Re-download relying on cache (ExternalDownloadDisallowed error thrown otherwise)
        return downloader.download(version, opts);
    })
        .then(path => {
        t.assert(path, "second download worked (from cache)");
        t.assert(path.includes(generatedCacheDir), `download path includes the generatedCacheDir [${generatedCacheDir}]`);
    })
        .then(() => t.end())
        .catch(t.end);
});
// https://github.com/scoutapp/scout_apm_node/issues/59
(0, tape_1.default)("download works with a custom root URL + agent full name", t => {
    const downloader = new web_1.WebAgentDownloader();
    const version = new types_1.CoreAgentVersion("1.1.8");
    const opts = {
        coreAgentFullName: "scout_apm_core-v1.1.8-x86_64-unknown-linux-gnu",
        downloadUrl: "https://s3-us-west-1.amazonaws.com/scout-public-downloads/apm_core_agent/release",
        coreAgentDir: "/tmp/scout_apm_core",
    };
    downloader
        .download(version, opts)
        .then(path => {
        t.assert(path, `binary path is non-null (${path})`);
        t.assert(opts.coreAgentDir && path.includes(opts.coreAgentDir), `binary path contains coreAgentDir`);
    })
        .then(() => t.end())
        .catch(t.end);
});
// https://github.com/scoutapp/scout_apm_node/issues/59
(0, tape_1.default)("download fails with invalid custom URL", t => {
    const downloader = new web_1.WebAgentDownloader();
    const version = new types_1.CoreAgentVersion("1.1.8");
    const coreAgentDir = "/tmp/scout_apm_core";
    const opts = {
        coreAgentFullName: "invalid.tgz",
        downloadUrl: "https://s3-us-west-1.amazonaws.com/scout-public-downloads/apm_core_agent/release",
        coreAgentDir,
    };
    // We need to delete the binary to make sure the download is attempted
    fs.emptyDir(coreAgentDir)
        .then(() => downloader.download(version, opts))
        .then(() => t.end(new Error("expected download() call to fail")))
        .catch(err => {
        if (err && err.name === "HTTPError" && err.statusCode === 404) {
            t.pass("download failed with a 404");
            t.end();
            return;
        }
        t.end(err);
    });
});
