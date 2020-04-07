"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const path = require("path");
const fs = require("fs-extra");
const tmp = require("tmp-promise");
const Constants = require("../../lib/constants");
const types_1 = require("../../lib/types");
const web_1 = require("../../lib/agent-downloaders/web");
test("download works (v1.1.8)", t => {
    const downloader = new web_1.WebAgentDownloader();
    const version = new types_1.CoreAgentVersion("1.1.8");
    downloader
        .download(version)
        .then(path => t.assert(path, `binary path is non-null (${path})`))
        .then(() => t.end())
        .catch(t.end);
});
test("cache is updated by download (v1.1.8)", t => {
    const opts = {
        cacheDir: Constants.DEFAULT_CORE_AGENT_DOWNLOAD_CACHE_DIR,
        updateCache: true,
    };
    const downloader = new web_1.WebAgentDownloader();
    const version = new types_1.CoreAgentVersion("1.1.8");
    let subdir = `scout_apm_core-v${version.raw}`;
    let expectedDirPath;
    let expectedBinPath;
    types_1.detectPlatformTriple()
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
test("cache is used by second download (v1.1.8)", t => {
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
test("download works with a custom root URL + agent full name", t => {
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
test("download fails with invalid custom URL", t => {
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
