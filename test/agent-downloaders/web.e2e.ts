import * as test from "tape";

import * as Errors from "../../lib/errors";
import { CoreAgentVersion } from "../../lib/types";
import { WebAgentDownloader } from "../../lib/agent-downloaders/web";

test("v1.1.8 download works", t => {
    const downloader = new WebAgentDownloader();
    const version = new CoreAgentVersion("1.1.8");

    downloader
        .download(version)
        .then(path => t.assert(path, `binary path is non-null (${path})`))
        .then(() => t.end())
        .catch(t.end);
});
