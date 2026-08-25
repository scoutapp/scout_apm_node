import * as https from "https";
import * as http from "http";
import * as path from "path";
import * as zlib from "zlib";
import { pipeline, Readable } from "stream";
import * as tarStream from "tar-stream";
import * as fs from "fs-extra";

// Maximum number of HTTP redirects to follow when downloading
const MAX_REDIRECTS = 10;

/**
 * Error thrown when an HTTP download fails with a non-success status code.
 * Carries the status code so callers/tests can inspect it programmatically.
 */
export class HTTPError extends Error {
    public readonly statusCode: number;

    constructor(url: string, statusCode: number) {
        super(`Failed to download [${url}]: HTTP ${statusCode}`);
        this.name = "HTTPError";
        this.statusCode = statusCode;
    }
}

/**
 * Download a URL to a Buffer, following redirects.
 *
 * This replaces the download/got dependency chain with a small wrapper over
 * Node's built-in http(s) client.
 *
 * @param {string} url - The URL to download
 * @param {number} [redirectsRemaining] - Internal counter used to limit redirects
 * @returns {Promise<Buffer>} A promise that resolves to the downloaded bytes
 */
export function fetchToBuffer(url: string, redirectsRemaining: number = MAX_REDIRECTS): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const client = url.startsWith("http://") ? http : https;

        const req = client.get(url, res => {
            const status = res.statusCode || 0;

            // Follow redirects (3xx with a location header)
            if (status >= 300 && status < 400 && res.headers.location) {
                res.resume(); // drain the response so the socket can be reused/freed

                if (redirectsRemaining <= 0) {
                    reject(new Error(`Too many redirects while downloading [${url}]`));
                    return;
                }

                // Resolve relative redirect targets against the current URL
                const nextUrl = new URL(res.headers.location, url).toString();
                resolve(fetchToBuffer(nextUrl, redirectsRemaining - 1));
                return;
            }

            if (status < 200 || status >= 300) {
                res.resume();
                reject(new HTTPError(url, status));
                return;
            }

            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () => resolve(Buffer.concat(chunks)));
            res.on("error", reject);
        });

        req.on("error", reject);
    });
}

/**
 * Extract a gzipped tarball (.tgz) buffer into a destination directory.
 *
 * Entries are written with path-traversal ("zip slip") protection so a
 * malicious archive cannot write outside of destDir. File modes from the
 * archive are preserved (the core-agent binary must remain executable).
 *
 * @param {Buffer} tgz - The gzipped tarball contents
 * @param {string} destDir - Directory to extract into (created if missing)
 * @returns {Promise<void>}
 */
export function extractTarGz(tgz: Buffer, destDir: string): Promise<void> {
    return fs.ensureDir(destDir).then(() => new Promise<void>((resolve, reject) => {
        const resolvedDest = path.resolve(destDir);
        const extract = tarStream.extract();
        const pendingWrites: Array<Promise<void>> = [];
        let failed = false;

        const fail = (err: Error) => {
            if (failed) { return; }
            failed = true;
            extract.destroy();
            reject(err);
        };

        extract.on("entry", (header, stream, next) => {
            // Guard against path traversal: the resolved target must stay within destDir
            const targetPath = path.resolve(resolvedDest, header.name);
            if (targetPath !== resolvedDest && !targetPath.startsWith(resolvedDest + path.sep)) {
                stream.resume();
                fail(new Error(`Refusing to extract entry outside of target directory: [${header.name}]`));
                return;
            }

            if (header.type === "directory") {
                pendingWrites.push(fs.ensureDir(targetPath));
                stream.resume();
                stream.on("end", next);
                return;
            }

            // Collect the entry contents, then write with the archived file mode
            const chunks: Buffer[] = [];
            stream.on("data", (chunk: unknown) => { chunks.push(chunk as Buffer); });
            stream.on("error", fail);
            stream.on("end", () => {
                const write = fs.ensureDir(path.dirname(targetPath))
                    .then(() => fs.writeFile(targetPath, Buffer.concat(chunks), {
                        mode: typeof header.mode === "number" ? header.mode : undefined,
                    }));
                pendingWrites.push(write);
                write.then(() => next(), fail);
            });
        });

        extract.on("finish", () => {
            if (failed) { return; }
            Promise.all(pendingWrites).then(() => resolve(), fail);
        });

        extract.on("error", fail);

        // Gunzip the buffer, then feed it to the tar extractor. tar-stream's
        // Extract isn't typed as a Node WritableStream, so we wire the gzip
        // stage with stream.pipeline (for proper error propagation) and pipe
        // its output into the extractor manually.
        const gunzip = zlib.createGunzip();
        pipeline(
            Readable.from(tgz),
            gunzip,
            (err?: Error | null) => { if (err) { fail(err); } },
        );
        gunzip.pipe(extract as unknown as NodeJS.WritableStream);
    }));
}

/**
 * Download a .tgz from a URL and extract it into destDir, or (when extract is
 * false) write the raw downloaded bytes to a file named after the URL's
 * basename inside destDir.
 *
 * This is a drop-in replacement for the previous `download(url, destDir, {extract})`
 * usage, scoped to exactly how the core-agent downloader uses it.
 *
 * @param {string} url - The URL to download
 * @param {string} destDir - Destination directory
 * @param {object} [opts]
 * @param {boolean} [opts.extract] - Whether to extract the download as a .tgz
 * @returns {Promise<void>}
 */
export function downloadAndMaybeExtract(
    url: string,
    destDir: string,
    opts?: { extract?: boolean },
): Promise<void> {
    return fetchToBuffer(url).then(buf => {
        if (opts && opts.extract) {
            return extractTarGz(buf, destDir);
        }

        // Non-extract path: write the raw file using the URL's basename
        const basename = path.basename(new URL(url).pathname) || "download";
        return fs.ensureDir(destDir).then(() => fs.writeFile(path.join(destDir, basename), buf));
    });
}
