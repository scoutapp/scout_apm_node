import { Readable } from "stream";

import { AgentDownloader, AgentDownloadOptions } from "../types";
import * as Errors from "../errors";

class WebAgentDownloader implements AgentDownloader {
    public download(opts: AgentDownloadOptions): Promise<Readable> {
        return Promise.reject(new Errors.NotImplemented());
    }
}
