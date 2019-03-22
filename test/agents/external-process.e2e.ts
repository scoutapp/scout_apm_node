import * as test from "tape";
import { ChildProcess } from "child_process";

import * as Errors from "../../lib/errors";
import ExternalProcessAgent from "../../lib/agents/external-process";
import WebAgentDownloader from "../../lib/agent-downloaders/web";
import { CoreAgentVersion, AgentResponse, AgentResponseType, V1GetVersionMessage } from "../../lib/types";
import { bootstrapExternalProcessAgent } from "../util";

test("external process can be launched locally (v1.1.8)", t => {
    let agent: ExternalProcessAgent;
    let process: ChildProcess;

    // Create the external process agent
    bootstrapExternalProcessAgent(t, "1.1.8")
        .then(a => agent = a)
    // Start the agent & check it was started by viewing the process
        .then(() => agent.start())
        .then(() => agent.getProcess())
        .then(p => process = p)
        .then(() => t.assert(process, "process was started by this agent"))
    // Cleanup the process
        .then(() => process.kill())
        .then(() => t.end())
        .catch(t.end);
});

test("GetVersion message works (v1.1.8)", t => {
    let agent: ExternalProcessAgent;

    // Create the external process agent
    bootstrapExternalProcessAgent(t, "1.1.8")
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => agent.start())
        .then(() => agent.connect())
    // Send GetVersion message
        .then(() => agent.send(new V1GetVersionMessage()))
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1GetVersionResponse);
        })
    // Cleanup the process & end test
        .then(() => agent.getProcess())
        .then(process => process.kill())
        .then(() => t.end())
        .catch(t.end);
});
