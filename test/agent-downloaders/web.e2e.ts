import * as test from "tape";
import * as path from "path";
import * as fs from "fs-extra";
import * as tmp from "tmp-promise";

import * as Errors from "../../lib/errors";
import * as Constants from "../../lib/constants";
import { CoreAgentVersion, AgentDownloadOptions } from "../../lib/types";
import { WebAgentDownloader } from "../../lib/agent-downloaders/web";

test("download works (v1.1.8)", t => {
    const downloader = new WebAgentDownloader();
    const version = new CoreAgentVersion("1.1.8");

    downloader
        .download(version)
        .then(path => t.assert(path, `binary path is non-null (${path})`))
        .then(() => t.end())
        .catch(t.end);
});

test("cache is updated by download (v1.1.8)", t => {
    const opts: AgentDownloadOptions = {
        cacheDir: Constants.DEFAULT_CORE_AGENT_DOWNLOAD_CACHE_DIR,
        updateCache: true,
    };
    const downloader = new WebAgentDownloader();
    const version = new CoreAgentVersion("1.1.8");

    // The cache should have created a versioned path to the binary
    const expectedDirPath = path.join(
        Constants.DEFAULT_CORE_AGENT_DOWNLOAD_CACHE_DIR,
        version.raw,
    );
    const expectedBinPath = path.join(
        expectedDirPath,
        Constants.CORE_AGENT_BIN_FILE_NAME,
    );

    downloader
        .download(version, opts)
        .then(() => Promise.all([
            fs.pathExists(expectedDirPath),
            fs.pathExists(expectedBinPath),
        ]))
        .then(([dirExists, binExists]: boolean[]) => {
            t.assert(dirExists, `expected cache dir [${expectedDirPath}] was populated`);
            t.assert(binExists, `expected cache binary path [${expectedBinPath}] was populated`);
        })
        .then(() => t.end())
        .catch(t.end);
});

test("cache is used by second download (v1.1.8)", t => {
    const downloader = new WebAgentDownloader();
    const version = new CoreAgentVersion("1.1.8");
    const opts: AgentDownloadOptions = {updateCache: true};
    let generatedCacheDir: string;

    // Create a temporary directory for opts to use
    // this ensure tests don't collide
    tmp.dir({prefix: "core-agent-web-dl-cache-test"})
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
            t.assert(
                path.includes(generatedCacheDir),
                `download path includes the generatedCacheDir [${generatedCacheDir}]`,
            );
        })
        .then(() => t.end())
        .catch(t.end);
});

// https://github.com/scoutapp/scout_apm_node/issues/59
test("download works with a custom root URL + agent full name", t => {
    const downloader = new WebAgentDownloader();
    const version = new CoreAgentVersion("1.1.8");
    const opts: AgentDownloadOptions = {
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
    const downloader = new WebAgentDownloader();
    const version = new CoreAgentVersion("1.1.8");
    const opts: AgentDownloadOptions = {
        coreAgentFullName: "invalid.tgz",
        downloadUrl: "https://s3-us-west-1.amazonaws.com/scout-public-downloads/apm_core_agent/release",
        coreAgentDir: "/tmp/scout_apm_core",
    };

    downloader
        .download(version, opts)
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
