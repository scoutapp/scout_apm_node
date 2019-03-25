import * as path from "path";
import * as tmp from "tmp-promise";

import * as Constants from "../lib/constants";
import ExternalProcessAgent from "../lib/agents/external-process";
import WebAgentDownloader from "../lib/agent-downloaders/web";
import {
    CoreAgentVersion,
    ProcessOptions,
    AgentDownloadOptions,
    Agent,
    V1Register,
} from "../lib/types";
import { Test } from "tape";

// Helper for downloading and creating an agent
export function bootstrapExternalProcessAgent(
    t: Test,
    rawVersion: string,
    opts?: {
        buildProcOpts?: (bp: string, uri: string) => ProcessOptions,
    },
): Promise<ExternalProcessAgent> {
    const downloadOpts: AgentDownloadOptions = {
        cacheDir: Constants.DEFAULT_CORE_AGENT_DOWNLOAD_CACHE_DIR,
        updateCache: true,
    };
    const downloader = new WebAgentDownloader();
    const version = new CoreAgentVersion(rawVersion);

    let uri: string;
    let binPath: string;

    // Download binary
    return downloader
        .download(version, downloadOpts)
        .then(bp => binPath = bp)
    // Create temporary directory for socket
        .then(() => tmp.dir({prefix: "core-agent-test-"}))
        .then(result => {
            const socketPath = path.join(result.path, "core-agent.sock");
            uri = `unix://${socketPath}`;
        })
    // Start process
        .then(() => {
            let procOpts = new ProcessOptions(binPath, uri);
            if (opts && opts.buildProcOpts) {
                procOpts = opts.buildProcOpts(binPath, uri);
            }

            t.comment(`creating external process agent @ [${uri}]...`);
            return new ExternalProcessAgent(procOpts);
        });
}

// Helper for initializing a bootstrapped agent
export function initializeAgent(
    t: Test,
    agent: Agent,
    appName: string,
    agentKey: string,
    appVersion: CoreAgentVersion,
): Promise<Agent> {
    t.comment(`initializing agent with appName [${appName}]`);
    return agent.start()
        .then(() => agent.connect())
        .then(() => agent.send(new V1Register(appName, agentKey, appVersion)))
        .then(() => agent);
}

export function waitMs(ms: number, t?: Test): Promise<void> {
    return new Promise(resolve => {
        setTimeout(() => {
            if (t) { t.comment(`...waited ${ms}ms`); }
            resolve();
        }, ms);
    });
}

// Helper function for cleaning up an agent processe and passing/failing a test
export function cleanup(t: Test, agent: ExternalProcessAgent, err?: Error): Promise<void> {
    return agent.getProcess()
        .then(process => process.kill())
        .then(() => t.end(err));
}
