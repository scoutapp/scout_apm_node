import * as test from "tape";
import { ChildProcess } from "child_process";

import * as Errors from "../../lib/errors";
import ExternalProcessAgent from "../../lib/agents/external-process";
import WebAgentDownloader from "../../lib/agent-downloaders/web";
import { waitMs, bootstrapExternalProcessAgent } from "../util";

import {
    AgentEvent,
    AgentResponse,
    AgentResponseType,
    CoreAgentVersion,
    V1GetVersionRequest,
    V1GetVersionResponse,
} from "../../lib/types";

// test("external process can be launched locally (v1.1.8)", t => {
//     let agent: ExternalProcessAgent;
//     let process: ChildProcess;

//     // Create the external process agent
//     bootstrapExternalProcessAgent(t, "1.1.8")
//         .then(a => agent = a)
//     // Start the agent & check it was started by viewing the process
//         .then(() => agent.start())
//         .then(() => agent.getProcess())
//         .then(p => process = p)
//         .then(() => t.assert(process, "process was started by this agent"))
//     // Cleanup the process
//         .then(() => process.kill())
//         .then(() => t.end())
//         .catch(t.end);
// });

// test("manual async GetVersion message works (v1.1.8)", t => {
//     let agent: ExternalProcessAgent;

//     // Create the external process agent
//     bootstrapExternalProcessAgent(t, "1.1.8")
//         .then(a => agent = a)
//     // Start the agent & connect to the local socket
//         .then(() => agent.start())
//         .then(() => agent.connect())
//     // Send GetVersion message
//         .then(() => {
//             const listener = (resp: any) => {
//                 // Skip all messages that don't match the expected response
//                 if (resp.type !== AgentResponseType.V1GetVersionResponse) { return; }

//                 // Ensure the version we got back is what we expect
//                 t.equals(resp.version.raw, "1.1.8", "parsed response version matches (1.1.8)");

//                 // Remove listener
//                 agent.removeListener(AgentEvent.SocketResponseReceived, listener);
//                 // Clean up process, end test
//                 agent.getProcess()
//                     .then(process => process.kill())
//                     .then(() => t.end())
//                     .catch(t.end);
//             }

//             // Set up a listener on the agent that succeeds when we see the response for the get version
//             agent.on(AgentEvent.SocketResponseReceived, listener);

//             // Send the version get (that should trigger the event emitter on the agent)
//             agent.sendAsync(new V1GetVersionRequest());
//         })
//     // Cleanup the process & end test
//         .catch(t.end);
// });

test("GetVersion message works (v1.1.8)", t => {
    let agent: ExternalProcessAgent;

    // Create the external process agent
    bootstrapExternalProcessAgent(t, "1.1.8")
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => agent.start())
        .then(() => agent.connect())
    // Send GetVersion message
        .then(() => agent.send(new V1GetVersionRequest()))
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1GetVersionResponse, "expected response received");
        })
    // Cleanup the process & end test
        .then(() => agent.getProcess())
        .then(process => process.kill())
        .then(() => t.end())
        .catch(t.end);
});
