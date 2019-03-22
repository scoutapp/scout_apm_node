import { Test } from "tape";
import ExternalProcessAgent from "../lib/agents/external-process";
import WebAgentDownloader from "../lib/agent-downloaders/web";
import { CoreAgentVersion, ProcessOptions } from "../lib/types";

// Helper for downloading and creating an agent
export function bootstrapExternalProcessAgent(t: Test, rawVersion: string): Promise<ExternalProcessAgent> {
    const downloader = new WebAgentDownloader();
    const version = new CoreAgentVersion(rawVersion);

    let uri: string;

    return downloader
        .download(version)
        .then(binPath => {
            // Use temp directory for socket uri
            uri = `unix://${binPath}.sock`;
            const options = new ProcessOptions(binPath, uri);
            t.comment(`creating external process agent @ [${uri}]...`);
            return new ExternalProcessAgent(options);
        });
}

export function waitMs(ms: number, t?: Test): Promise<void> {
    return new Promise(resolve => {
        setTimeout(() => {
            if (t) { t.comment(`...waited ${ms}ms`); }
            resolve();
        }, ms);
    });
}
