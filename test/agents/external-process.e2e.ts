import * as test from "tape";
import { ChildProcess } from "child_process";

import * as Errors from "../../lib/errors";
import * as Constants from "../../lib/constants";
import ExternalProcessAgent from "../../lib/agents/external-process";
import WebAgentDownloader from "../../lib/agent-downloaders/web";
import * as TestUtil from "../util";
import * as Fixtures from "../fixtures";

import {
    AgentEvent,
    AgentResponse,
    AgentResponseType,
    ApplicationEventType,
    CoreAgentVersion,
    ProcessOptions,
    APIVersion,
} from "../../lib/types";
import * as Requests from "../../lib/protocol/v1/requests";

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
            agent.sendAsync(new Requests.V1GetVersionRequest());
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
        .then(() => agent.send(new Requests.V1GetVersionRequest()))
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
        .then(() => agent.send(new Requests.V1Register(
            TEST_APP_NAME,
            TEST_AGENT_KEY,
            APIVersion.V1,
        )))
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1Register, "type matches");
            t.assert(resp.succeeded(), "register succeeded");
        })
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
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
        .then(() => agent.send(new Requests.V1StartRequest()))
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
    let start: Requests.V1StartRequest;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send StartRequest
        .then(() => {
            start = new Requests.V1StartRequest();
            return agent.send(start);
        })
    // Send finish request
        .then(() => agent.send(new Requests.V1FinishRequest(start.requestId)))
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
    let start: Requests.V1StartRequest;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send StartRequest
        .then(() => {
            start = new Requests.V1StartRequest();
            return agent.send(start);
        })
    // Tag the request
        .then(() => agent.send(new Requests.V1TagRequest(
            start.requestId,
            "tag-request-test",
            "value",
        )))
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1TagRequest, "type matches");
            t.assert(resp.succeeded(), "tag-request succeeded");
        })
    // Finish the request
        .then(() => agent.send(new Requests.V1FinishRequest(start.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "finish-request succeeded"))
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("StartSpan message works for leaf span (v1.1.8)", t => {
    const appVersion = new CoreAgentVersion(TEST_APP_VERSION);
    let agent: ExternalProcessAgent;
    let start: Requests.V1StartRequest;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send StartRequest
        .then(() => {
            start = new Requests.V1StartRequest();
            return agent.send(start);
        })
    // Start a span (no parent)
        .then(() => agent.send(new Requests.V1StartSpan(
            "test/start-span",
            start.requestId,
        )))
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1StartSpan, "type matches");
            t.assert(resp.succeeded(), "start-span succeeded");
        })
    // Finish the request
        .then(() => agent.send(new Requests.V1FinishRequest(start.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "finish-request succeeded"))
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("StopSpan works for leaf span (v1.1.8)", t => {
    const appVersion = new CoreAgentVersion(TEST_APP_VERSION);
    let agent: ExternalProcessAgent;

    let reqStart: Requests.V1StartRequest;
    let spanStart: Requests.V1StartSpan;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send StartRequest
        .then(() => {
            reqStart = new Requests.V1StartRequest();
            return agent.send(reqStart);
        })
    // Start a span (no parent)
        .then(() => {
            spanStart = new Requests.V1StartSpan("test/start-span", reqStart.requestId);
            return agent.send(spanStart);
        })
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1StartSpan, "type matches");
            t.assert(resp.succeeded(), "start-span succeeded");
        })
    // Stop the span
        .then(() => agent.send(new Requests.V1StopSpan(spanStart.spanId, spanStart.requestId)))
        .then((resp: AgentResponse) => {
            t.equals(resp.type, AgentResponseType.V1StopSpan, "type matches");
            t.assert(resp.succeeded(), "stop-span succeeded");
        })
    // Finish the request
        .then(() => agent.send(new Requests.V1FinishRequest(reqStart.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "finish-request succeeded"))
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("TagSpan works for leaf span (v1.1.8)", t => {
    const appVersion = new CoreAgentVersion(TEST_APP_VERSION);
    let agent: ExternalProcessAgent;

    let reqStart: Requests.V1StartRequest;
    let spanStart: Requests.V1StartSpan;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send StartRequest
        .then(() => {
            reqStart = new Requests.V1StartRequest();
            return agent.send(reqStart);
        })
    // Start a span (no parent)
        .then((resp: AgentResponse) => {
            spanStart = new Requests.V1StartSpan("test/start-span", reqStart.requestId);
            return agent.send(spanStart);
        })
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "start-span succeeded"))
    // Tag the span
        .then(() => agent.send(new Requests.V1TagSpan(
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
        .then(() => agent.send(new Requests.V1StopSpan(spanStart.spanId, spanStart.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "stop-span succeeded"))
    // Finish the request
        .then(() => agent.send(new Requests.V1FinishRequest(reqStart.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "finish-request succeeded"))
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("ApplicationEvent for application metadata works (v1.1.8)", t => {
    const appVersion = new CoreAgentVersion(TEST_APP_VERSION);
    let agent: ExternalProcessAgent;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send application event with metadata
        .then(() => agent.sendAsync(new Requests.V1ApplicationEvent(
            "application-event-test",
            ApplicationEventType.ScoutMetadata,
            Fixtures.APP_META,
        )))
        .then(() => t.pass("async send did not fail"))
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("ApplicationEvent for sampling works (v1.1.8)", t => {
    const appVersion = new CoreAgentVersion(TEST_APP_VERSION);
    let agent: ExternalProcessAgent;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send application event with CPU sample
        .then(() => agent.sendAsync(new Requests.V1ApplicationEvent(
            "application-event-test",
            ApplicationEventType.CPUUtilizationPercent,
            10,
        )))
    // Send application event with memory sample
        .then(() => agent.sendAsync(new Requests.V1ApplicationEvent(
            "application-event-test",
            ApplicationEventType.MemoryUsageMB,
            500,
        )))
        .then(() => t.pass("async send did not fail"))
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("Nested spans work (v1.1.8)", t => {
    const appVersion = new CoreAgentVersion(TEST_APP_VERSION);
    let agent: ExternalProcessAgent;

    let reqStart: Requests.V1StartRequest;
    let childSpanStart: Requests.V1StartSpan;
    let parentSpanStart: Requests.V1StartSpan;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send StartRequest
        .then(() => {
            reqStart = new Requests.V1StartRequest();
            return agent.send(reqStart);
        })
    // Start a span (no parent)
        .then((resp: AgentResponse) => {
            parentSpanStart = new Requests.V1StartSpan("test/start-span", reqStart.requestId);
            return agent.send(parentSpanStart);
        })
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "start-span succeeded (parent)"))
    // Start a child span
        .then(() => {
            childSpanStart = new Requests.V1StartSpan(
                "test/start-span",
                reqStart.requestId,
                {parentId: parentSpanStart.spanId},
            );
            return agent.send(childSpanStart);
        })
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "start-span succeeded (child)"))
    // Stop the child span
        .then(() => agent.send(new Requests.V1StopSpan(childSpanStart.spanId, childSpanStart.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "stop-span succeeded (child)"))
    // Stop the parent span
        .then(() => agent.send(new Requests.V1StopSpan(parentSpanStart.spanId, parentSpanStart.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "stop-span succeeded (parent)"))
    // Finish the request
        .then(() => agent.send(new Requests.V1FinishRequest(reqStart.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "finish-request succeeded"))
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("Nested spans work in the wrong close order (v1.1.8)", t => {
    const appVersion = new CoreAgentVersion(TEST_APP_VERSION);
    let agent: ExternalProcessAgent;

    let reqStart: Requests.V1StartRequest;
    let childSpanStart: Requests.V1StartSpan;
    let parentSpanStart: Requests.V1StartSpan;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send StartRequest
        .then(() => {
            reqStart = new Requests.V1StartRequest();
            return agent.send(reqStart);
        })
    // Start a span (no parent)
        .then((resp: AgentResponse) => {
            parentSpanStart = new Requests.V1StartSpan("test/start-span", reqStart.requestId);
            return agent.send(parentSpanStart);
        })
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "start-span succeeded (parent)"))
    // Start a child span
        .then(() => {
            childSpanStart = new Requests.V1StartSpan(
                "test/start-span",
                reqStart.requestId,
                {parentId: parentSpanStart.spanId},
            );
            return agent.send(childSpanStart);
        })
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "start-span succeeded (child)"))
    // Stop the parent span
        .then(() => agent.send(new Requests.V1StopSpan(parentSpanStart.spanId, parentSpanStart.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "stop-span succeeded (parent)"))
    // Stop the child span
        .then(() => agent.send(new Requests.V1StopSpan(childSpanStart.spanId, childSpanStart.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "stop-span succeeded (child)"))
    // Finish the request
        .then(() => agent.send(new Requests.V1FinishRequest(reqStart.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "finish-request succeeded"))
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});

test("Request with 'Controller' span works, after waiting for flush (v1.1.8)", t => {
    const appVersion = new CoreAgentVersion(TEST_APP_VERSION);
    let agent: ExternalProcessAgent;

    let reqStart: Requests.V1StartRequest;
    let spanStart: Requests.V1StartSpan;

    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) { return t.end(new Error("TEST_AGENT_KEY ENV variable")); }

    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TEST_APP_VERSION)
        .then(a => agent = a)
    // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TEST_APP_NAME, TEST_AGENT_KEY, appVersion))
    // Send StartRequest
        .then(() => {
            reqStart = new Requests.V1StartRequest();
            return agent.send(reqStart);
        })
    // Start the controller span
        .then((resp: AgentResponse) => {
            spanStart = new Requests.V1StartSpan("Controller/test", reqStart.requestId);
            return agent.send(spanStart);
        })
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "start-span succeeded"))
    // Stop the span
        .then(() => agent.send(new Requests.V1StopSpan(spanStart.spanId, spanStart.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "stop-span succeeded"))
    // Finish the request
        .then(() => agent.send(new Requests.V1FinishRequest(reqStart.requestId)))
        .then((resp: AgentResponse) => t.assert(resp.succeeded(), "finish-request succeeded"))
    // Wait for agent to clear internal request buffers (and send the requests)
        .then(() => TestUtil.waitForAgentBufferFlush(t))
    // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});
