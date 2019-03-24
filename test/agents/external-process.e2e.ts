import * as test from "tape";
import { ChildProcess } from "child_process";

import * as Errors from "../../lib/errors";
import * as Constants from "../../lib/constants";
import ExternalProcessAgent from "../../lib/agents/external-process";
import WebAgentDownloader from "../../lib/agent-downloaders/web";
import * as TestUtil from "../util";

import {
    AgentEvent,
    AgentResponse,
    AgentResponseResult,
    AgentResponseType,
    CoreAgentVersion,
    V1GetVersionRequest,
    V1GetVersionResponse,
    V1RegisterRequest,
    V1RegisterResponse,
    ProcessOptions,
} from "../../lib/types";

const TEST_AGENT_KEY = process.env.TEST_AGENT_KEY;
const TEST_APP_NAME = "scout-e2e-tests";
const TEST_APP_VERSION = "1.1.8";

test("external process can be launched locally (v1.1.8)", t => {
    let agent: ExternalProcessAgent;
    let process: ChildProcess;

    // Create the external process agent
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & check it was started by viewing the process
        .then(() => agent.start())
        .then(() => agent.getProcess())
        .then(p => process = p)
        .then(() => t.assert(process, "process was started by this agent"))
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("manual async GetVersion message works (v1.1.8)", t => {
    let agent: ExternalProcessAgent;

    // Create the external process agent
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => agent.start())
        .then(() => agent.connect())
    // Send GetVersion message
        .then(() => {
            const listener = (resp: any) => {
                // Skip all messages that don't match the expected response
                if (resp.type !== AgentResponseType.V1GetVersion) { return; }

                // Ensure the version we got back is what we expect
                t.equals(resp.version.raw, TEST_APP_VERSION, "parsed response version matches (1.1.8)");

                // Remove listener
                agent.removeListener(AgentEvent.SocketResponseReceived, listener);
                // Clean up process, end test
                TestUtil.cleanup(t, agent)
                    .catch(err => TestUtil.cleanup(t, agent, err));
            };

            // Set up a listener on the agent that succeeds when we see the response for the get version
            agent.on(AgentEvent.SocketResponseReceived, listener);

            // Send the version get (that should trigger the event emitter on the agent)
            agent.sendAsync(new V1GetVersionRequest());
        })
    // Cleanup the process & end test
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("GetVersion message works (v1.1.8)", t => {
    let agent: ExternalProcessAgent;

    // Create the external process agent
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => agent.start())
        .then(() => agent.connect())
    // Send GetVersion message
        .then(() => agent.send(new V1GetVersionRequest()))
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1GetVersion, "expected response received");
        })
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("Register message works (v1.1.8)", t => {
    let agent: ExternalProcessAgent;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => agent.start())
        .then(() => agent.connect())
    // Send GetVersion message
        .then(() => agent.send(new V1RegisterRequest(
            TEST_APP_NAME,
            TEST_AGENT_KEY,
            new CoreAgentVersion(TEST_APP_VERSION),
        )))
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1Register, "type matches");
            t.equals((resp as V1RegisterResponse).result, AgentResponseResult.Success, "register succeeded");
        })
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("Socket reconnection retry works (v1.1.8)", t => {
    let agent: ExternalProcessAgent;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => agent.start())
        .then(() => agent.connect())
    // Kill the agent process, socket should disconnect and a reconnection will be attempted (though it will fail)
        .then(() => {
            const listener = () => {
                t.pass("socket reconnection attempted");
                agent.removeListener(AgentEvent.SocketReconnectAttempted, listener);
                t.end();
            };

            // Set up a listener on the agent that succeeds when we see the response for the get version
            agent.on(AgentEvent.SocketReconnectAttempted, listener);

            // Kill the process (which should disconnect the socket)
            agent.getProcess()
                .then(p => p.kill())
               .catch(err => TestUtil.cleanup(t, agent, err));
        })
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("Socket reconnection limit of 0 is respected (v1.1.8)", t => {
    let agent: ExternalProcessAgent;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Make a builder fn for proc opts that includes the socket reconnect limit
    const buildProcOpts = (binPath: string, uri: string) => new ProcessOptions(binPath, uri, {socketReconnectLimit: 0});

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION, {buildProcOpts})
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => agent.start())
        .then(() => agent.connect())
    // Kill the agent process, socket should disconnect and a reconnection will be attempted (though it will fail)
        .then(() => {
            const listener = () => {
                t.pass("socket reconnect limit (0) reached immediately");
                agent.removeListener(AgentEvent.SocketReconnectLimitReached, listener);
                t.end();
            };

            // Set up a listener on the agent that succeeds when we see the response for the get version
            agent.on(AgentEvent.SocketReconnectLimitReached, listener);

            // Kill the process (which should disconnect the socket)
            agent.getProcess()
                .then(p => p.kill())
                .catch(err => TestUtil.cleanup(t, agent, err));
        })
        .catch(err => TestUtil.cleanup(t, agent, err));
});
