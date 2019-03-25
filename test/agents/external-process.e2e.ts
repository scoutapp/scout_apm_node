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
    AgentResponseType,
    CoreAgentVersion,
    ProcessOptions,
} from "../../lib/types";
import * as V1Request from "../../lib/protocol/v1/requests";

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
            agent.sendAsync(new V1Request.V1GetVersionRequest());
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
        .then(() => agent.send(new V1Request.V1GetVersionRequest()))
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
    // Send Register message
        .then(() => agent.send(new V1Request.V1Register(
            TEST_APP_NAME,
            TEST_AGENT_KEY,
            new CoreAgentVersion(TEST_APP_VERSION),
        )))
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1Register, "type matches");
            t.assert(resp.succeeded(), "register succeeded");
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
    const buildProcOpts = (bp: string, uri: string) => new ProcessOptions(bp, uri, {socketReconnectLimit: 0});

    // Create the external process agent, with custom proc option builder
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

test("StartRequest message works (v1.1.8)", t => {
    const appVersion = new CoreAgentVersion(TEST_APP_VERSION);
    let agent: ExternalProcessAgent;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send StartRequest
        .then(() => agent.send(new V1Request.V1StartRequest()))
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1StartRequest, "type matches");
            t.assert(resp.succeeded(), "start-request succeeded");
        })
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("FinishRequest message works (v1.1.8)", t => {
    const appVersion = new CoreAgentVersion(TEST_APP_VERSION);
    let agent: ExternalProcessAgent;
    let start: V1Request.V1StartRequest;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send StartRequest
        .then(() => {
            start = new V1Request.V1StartRequest();
            return agent.send(start);
        })
    // Send finish request
        .then(() => agent.send(new V1Request.V1FinishRequest(start.requestId)))
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1FinishRequest, "type matches");
            t.assert(resp.succeeded(), "finish-request succeeded");
        })
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("TagRequest message works (v1.1.8)", t => {
    const appVersion = new CoreAgentVersion(TEST_APP_VERSION);
    let agent: ExternalProcessAgent;
    let start: V1Request.V1StartRequest;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send StartRequest
        .then(() => {
            start = new V1Request.V1StartRequest();
            return agent.send(start);
        })
    // Tag the request
        .then(() => agent.send(new V1Request.V1TagRequest(
            start.requestId,
            "tag-request-test",
            "value",
        )))
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1TagRequest, "type matches");
            t.assert(resp.succeeded(), "tag-request succeeded");
        })
    // Finish the request
        .then(() => agent.send(new V1Request.V1FinishRequest(start.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "finish-request succeeded"))
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("StartSpan message works for leaf span (v1.1.8)", t => {
    const appVersion = new CoreAgentVersion(TEST_APP_VERSION);
    let agent: ExternalProcessAgent;
    let start: V1Request.V1StartRequest;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send StartRequest
        .then(() => {
            start = new V1Request.V1StartRequest();
            return agent.send(start);
        })
    // Start a span (no parent)
        .then(() => agent.send(new V1Request.V1StartSpan(
            "test/start-span",
            start.requestId,
        )))
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1StartSpan, "type matches");
            t.assert(resp.succeeded(), "start-span succeeded");
        })
    // Finish the request
        .then(() => agent.send(new V1Request.V1FinishRequest(start.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "finish-request succeeded"))
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("StopSpan works for leaf span (v1.1.8)", t => {
    const appVersion = new CoreAgentVersion(TEST_APP_VERSION);
    let agent: ExternalProcessAgent;

    let reqStart: V1Request.V1StartRequest;
    let spanStart: V1Request.V1StartSpan;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send StartRequest
        .then(() => {
            reqStart = new V1Request.V1StartRequest();
            return agent.send(reqStart);
        })
    // Start a span (no parent)
        .then(() => {
            spanStart = new V1Request.V1StartSpan("test/start-span", reqStart.requestId);
            return agent.send(spanStart);
        })
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1StartSpan, "type matches");
            t.assert(resp.succeeded(), "start-span succeeded");
        })
    // Stop the span
        .then(() => agent.send(new V1Request.V1StopSpan(spanStart.spanId, spanStart.requestId)))
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1StopSpan, "type matches");
            t.assert(resp.succeeded(), "stop-span succeeded");
        })
    // Finish the request
        .then(() => agent.send(new V1Request.V1FinishRequest(reqStart.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "finish-request succeeded"))
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("TagSpan works for leaf span (v1.1.8)", t => {
    const appVersion = new CoreAgentVersion(TEST_APP_VERSION);
    let agent: ExternalProcessAgent;

    let reqStart: V1Request.V1StartRequest;
    let spanStart: V1Request.V1StartSpan;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send StartRequest
        .then(() => {
            reqStart = new V1Request.V1StartRequest();
            return agent.send(reqStart);
        })
    // Start a span (no parent)
        .then((resp: AgentResponse) => {
            spanStart = new V1Request.V1StartSpan("test/start-span", reqStart.requestId);
            return agent.send(spanStart);
        })
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "start-span succeeded"))
    // Tag the span
        .then(() => agent.send(new V1Request.V1TagSpan(
            "tag-span-test",
            "value",
            spanStart.spanId,
            spanStart.requestId,
        )))
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1TagSpan, "type matches");
            t.assert(resp.succeeded(), "tag-span succeeded");
        })
    // Stop the span
        .then(() => agent.send(new V1Request.V1StopSpan(spanStart.spanId, spanStart.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "stop-span succeeded"))
    // Finish the request
        .then(() => agent.send(new V1Request.V1FinishRequest(reqStart.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "finish-request succeeded"))
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});
