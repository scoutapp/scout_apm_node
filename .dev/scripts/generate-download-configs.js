#!/usr/bin/env node

// This script generates the download-configs.ts file
const process = require("process");
const fs = require("fs-extra");
const download = require("download");
const sha256File = require("sha256-file");

// Arguments
if (process.argv.length !== 3) {
  console.log("[error] missing path to json file to write for output");
  printUsage();
  process.exit(1);
}

const OUTPUT_FILE_PATH = process.argv[2];

function printUsage() {
  console.log("usage: generate-download-configs <path to json file for output>");
}

const VERSIONS = [
  "1.1.8",
  "1.2.4",
  "1.2.6",
  "1.2.7",
];

// Directory in which to store the downloaded tarballs
const LOCAL_DOWNLOAD_DIR = "/tmp/scout-downloads";

// Base URL to be used for downloads
const DOWNLOAD_BASE_URL = "https://s3-us-west-1.amazonaws.com/scout-public-downloads/apm_core_agent/release";

// Prefix for file to be downloaded
const DOWNLOAD_FILE_PREFIX = "scout_apm_core";

// Valid platform triples
const PLATFORM_TRIPLES = [
  "i686-unknown-linux-gnu",
  "x86_64-unknown-linux-gnu",
  "x86_64-unknown-linux-musl",
  "x86_64-apple-darwin",
];

// Get the binary name given a version (assuming some versions used a different name other than 'core-agent')
function getBinaryNameForVersion(version) {
  return "core-agent";
}

// Resulting file
const RESULT = {};
const OPERATIONS = [];

// For every version
VERSIONS.forEach(version => {
  RESULT[version] = [];

  // And for every platform triple
  PLATFORM_TRIPLES.forEach(platformTriple => {
    const url = `${DOWNLOAD_BASE_URL}/${DOWNLOAD_FILE_PREFIX}-v${version}-${platformTriple}.tgz`;

    // Build a list of operations
    OPERATIONS.push({
      version,
      platformTriple,
      run: () => {

        const localDownloadDir = `${LOCAL_DOWNLOAD_DIR}/${version}/${platformTriple}`;
        const unpackedArchiveDir = `${localDownloadDir}/unpacked`;
        const binName = getBinaryNameForVersion(version);
        const expectedBinPath = `${unpackedArchiveDir}/${binName}`;

        // Ensure the path exists
        return fs.ensureDir(unpackedArchiveDir)
        // Download and extract the archive, if it doesn't already exist
          .then(() => fs.exists(expectedBinPath))
          .then(binExists => {
            if (!binExists) {
              console.log(`[info] Downloading archive from url [${url}]`);
              return download(url, unpackedArchiveDir, {extract: true});
            }
            console.log(`[info] Skipping download for unpacked archive @ [${unpackedArchiveDir}]`);
          })
        // Ensure the expected binary path exists
          .then(() => fs.exists(expectedBinPath))
          .then(exists => {
            if (!exists) { throw new Error(`Expected binary [${expectedBinPath}] missing`); }
          })
        // Calculate the SHA sum w/ the bin name in the
          .then(() => sha256File(expectedBinPath))
        // Build the manfiest object
          .then(sha256Digest => {
            // Add the manifest to the result
            RESULT[version].push({
              manifest: {
                core_agent_binary: binName,
                core_agent_binary_sha256: sha256Digest, // download and unpack binary to get the sha256 sum
                core_agent_version: version,
                version,
              },
              platform: platformTriple,
              rawVersion: version,
              url,
              zipped: true,
            });
          });
      }, // /run()
    });
  });
});

// Run all the operations, serially
Promise.all(
  OPERATIONS.map(op => {
    console.log(`[info] Downloading version [${op.version}], triple [${op.platformTriple}]...`);
    return op.run();
  })
)
  .then(() => {
    console.log(`[info] writing JSON object to [${OUTPUT_FILE_PATH}]`);
    return fs.writeJson(OUTPUT_FILE_PATH, RESULT, {spaces: 2});
  });
