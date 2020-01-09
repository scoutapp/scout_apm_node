"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const Errors = require("../../lib/errors");
const TestUtil = require("../util");
const Fixtures = require("../fixtures");
const types_1 = require("../../lib/types");
const Requests = require("../../lib/protocol/v1/requests");
const TestConstants = require("../constants");
const TEST_AGENT_KEY = process.env.TEST_AGENT_KEY || "fake-agent-key";
test("external process can be launched locally (v1.2.7)", t => {
    let agent;
    let process;
    // Create the external process agent
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION)
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
test("manual async GetVersion message works (v1.2.7)", t => {
    let agent;
    // Create the external process agent
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION)
        .then(a => agent = a)
        // Start the agent & connect to the local socket
        .then(() => agent.start())
        .then(() => agent.connect())
        // Send GetVersion message
        .then(() => {
        const listener = (resp) => {
            // Skip all messages that don't match the expected response
            if (resp.type !== types_1.AgentResponseType.V1GetVersion) {
                return;
            }
            // Ensure the version we got back is what we expect
            t.equals(resp.version.raw, TestConstants.TEST_APP_VERSION, "parsed response version matches (1.2.7)");
            // Remove listener
            agent.removeListener(types_1.AgentEvent.SocketResponseReceived, listener);
            // Clean up process, end test
            TestUtil.cleanup(t, agent)
                .catch(err => TestUtil.cleanup(t, agent, err));
        };
        // Set up a listener on the agent that succeeds when we see the response for the get version
        agent.on(types_1.AgentEvent.SocketResponseReceived, listener);
        // Send the version get (that should trigger the event emitter on the agent)
        agent.sendAsync(new Requests.V1GetVersionRequest());
    })
        // Cleanup the process & end test
        .catch(err => TestUtil.cleanup(t, agent, err));
});
test("GetVersion message works (v1.2.7)", t => {
    let agent;
    // Create the external process agent
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION)
        .then(a => agent = a)
        // Start the agent & connect to the local socket
        .then(() => agent.start())
        .then(() => agent.connect())
        // Send GetVersion message
        .then(() => agent.send(new Requests.V1GetVersionRequest()))
        .then((resp) => {
        t.equals(resp.type, types_1.AgentResponseType.V1GetVersion, "expected response received");
    })
        // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});
test("Register message works (v1.2.7)", t => {
    let agent;
    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) {
        return t.end(new Error("TEST_AGENT_KEY ENV variable"));
    }
    // Create the external process agent
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION)
        .then(a => agent = a)
        // Start the agent & connect to the local socket
        .then(() => agent.start())
        .then(() => agent.connect())
        // Send Register message
        .then(() => agent.send(new Requests.V1Register(TestConstants.TEST_SCOUT_NAME, TEST_AGENT_KEY, types_1.APIVersion.V1)))
        .then((resp) => {
        t.equals(resp.type, types_1.AgentResponseType.V1Register, "type matches");
        t.assert(resp.succeeded(), "register succeeded");
    })
        // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});
test("StartRequest message works (v1.2.7)", t => {
    const appVersion = new types_1.CoreAgentVersion(TestConstants.TEST_APP_VERSION);
    let agent;
    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) {
        return t.end(new Error("TEST_AGENT_KEY ENV variable"));
    }
    // Create the external process agent
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION)
        .then(a => agent = a)
        // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TestConstants.TEST_SCOUT_NAME, TEST_AGENT_KEY, appVersion))
        // Send StartRequest
        .then(() => agent.send(new Requests.V1StartRequest()))
        .then((resp) => {
        t.equals(resp.type, types_1.AgentResponseType.V1StartRequest, "type matches");
        t.assert(resp.succeeded(), "start-request succeeded");
    })
        // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});
test("FinishRequest message works (v1.2.7)", t => {
    const appVersion = new types_1.CoreAgentVersion(TestConstants.TEST_APP_VERSION);
    let agent;
    let start;
    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) {
        return t.end(new Error("TEST_AGENT_KEY ENV variable"));
    }
    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION)
        .then(a => agent = a)
        // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TestConstants.TEST_SCOUT_NAME, TEST_AGENT_KEY, appVersion))
        // Send StartRequest
        .then(() => {
        start = new Requests.V1StartRequest();
        return agent.send(start);
    })
        // Send finish request
        .then(() => agent.send(new Requests.V1FinishRequest(start.requestId)))
        .then((resp) => {
        t.equals(resp.type, types_1.AgentResponseType.V1FinishRequest, "type matches");
        t.assert(resp.succeeded(), "finish-request succeeded");
    })
        // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});
test("TagRequest message works (v1.2.7)", t => {
    const appVersion = new types_1.CoreAgentVersion(TestConstants.TEST_APP_VERSION);
    let agent;
    let start;
    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) {
        return t.end(new Error("TEST_AGENT_KEY ENV variable"));
    }
    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION)
        .then(a => agent = a)
        // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TestConstants.TEST_SCOUT_NAME, TEST_AGENT_KEY, appVersion))
        // Send StartRequest
        .then(() => {
        start = new Requests.V1StartRequest();
        return agent.send(start);
    })
        // Tag the request
        .then(() => agent.send(new Requests.V1TagRequest("tag-request-test", "value", start.requestId)))
        .then((resp) => {
        t.equals(resp.type, types_1.AgentResponseType.V1TagRequest, "type matches");
        t.assert(resp.succeeded(), "tag-request succeeded");
    })
        // Finish the request
        .then(() => agent.send(new Requests.V1FinishRequest(start.requestId)))
        .then((resp) => t.assert(resp.succeeded(), "finish-request succeeded"))
        // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});
test("StartSpan message works for leaf span (v1.2.7)", t => {
    const appVersion = new types_1.CoreAgentVersion(TestConstants.TEST_APP_VERSION);
    let agent;
    let start;
    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) {
        return t.end(new Error("TEST_AGENT_KEY ENV variable"));
    }
    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION)
        .then(a => agent = a)
        // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TestConstants.TEST_SCOUT_NAME, TEST_AGENT_KEY, appVersion))
        // Send StartRequest
        .then(() => {
        start = new Requests.V1StartRequest();
        return agent.send(start);
    })
        // Start a span (no parent)
        .then(() => agent.send(new Requests.V1StartSpan("test/start-span", start.requestId)))
        .then((resp) => {
        t.equals(resp.type, types_1.AgentResponseType.V1StartSpan, "type matches");
        t.assert(resp.succeeded(), "start-span succeeded");
    })
        // Finish the request
        .then(() => agent.send(new Requests.V1FinishRequest(start.requestId)))
        .then((resp) => t.assert(resp.succeeded(), "finish-request succeeded"))
        // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});
test("StopSpan works for leaf span (v1.2.7)", t => {
    const appVersion = new types_1.CoreAgentVersion(TestConstants.TEST_APP_VERSION);
    let agent;
    let reqStart;
    let spanStart;
    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) {
        return t.end(new Error("TEST_AGENT_KEY ENV variable"));
    }
    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION)
        .then(a => agent = a)
        // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TestConstants.TEST_SCOUT_NAME, TEST_AGENT_KEY, appVersion))
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
        .then((resp) => {
        t.equals(resp.type, types_1.AgentResponseType.V1StartSpan, "type matches");
        t.assert(resp.succeeded(), "start-span succeeded");
    })
        // Stop the span
        .then(() => agent.send(new Requests.V1StopSpan(spanStart.spanId, spanStart.requestId)))
        .then((resp) => {
        t.equals(resp.type, types_1.AgentResponseType.V1StopSpan, "type matches");
        t.assert(resp.succeeded(), "stop-span succeeded");
    })
        // Finish the request
        .then(() => agent.send(new Requests.V1FinishRequest(reqStart.requestId)))
        .then((resp) => t.assert(resp.succeeded(), "finish-request succeeded"))
        // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});
test("TagSpan works for leaf span (v1.2.7)", t => {
    const appVersion = new types_1.CoreAgentVersion(TestConstants.TEST_APP_VERSION);
    let agent;
    let reqStart;
    let spanStart;
    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) {
        return t.end(new Error("TEST_AGENT_KEY ENV variable"));
    }
    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION)
        .then(a => agent = a)
        // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TestConstants.TEST_SCOUT_NAME, TEST_AGENT_KEY, appVersion))
        // Send StartRequest
        .then(() => {
        reqStart = new Requests.V1StartRequest();
        return agent.send(reqStart);
    })
        // Start a span (no parent)
        .then((resp) => {
        spanStart = new Requests.V1StartSpan("test/start-span", reqStart.requestId);
        return agent.send(spanStart);
    })
        .then((resp) => t.assert(resp.succeeded(), "start-span succeeded"))
        // Tag the span
        .then(() => agent.send(new Requests.V1TagSpan("tag-span-test", "value", spanStart.spanId, spanStart.requestId)))
        .then((resp) => {
        t.equals(resp.type, types_1.AgentResponseType.V1TagSpan, "type matches");
        t.assert(resp.succeeded(), "tag-span succeeded");
    })
        // Stop the span
        .then(() => agent.send(new Requests.V1StopSpan(spanStart.spanId, spanStart.requestId)))
        .then((resp) => t.assert(resp.succeeded(), "stop-span succeeded"))
        // Finish the request
        .then(() => agent.send(new Requests.V1FinishRequest(reqStart.requestId)))
        .then((resp) => t.assert(resp.succeeded(), "finish-request succeeded"))
        // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});
test("ApplicationEvent for application metadata works (v1.2.7)", t => {
    const appVersion = new types_1.CoreAgentVersion(TestConstants.TEST_APP_VERSION);
    let agent;
    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) {
        return t.end(new Error("TEST_AGENT_KEY ENV variable"));
    }
    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION)
        .then(a => agent = a)
        // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TestConstants.TEST_SCOUT_NAME, TEST_AGENT_KEY, appVersion))
        // Send application event with metadata
        .then(() => agent.sendAsync(new Requests.V1ApplicationEvent("application-event-test", types_1.ApplicationEventType.ScoutMetadata, Fixtures.APP_META)))
        .then(() => t.pass("async send did not fail"))
        // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});
test("ApplicationEvent for sampling works (v1.2.7)", t => {
    const appVersion = new types_1.CoreAgentVersion(TestConstants.TEST_APP_VERSION);
    let agent;
    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) {
        return t.end(new Error("TEST_AGENT_KEY ENV variable"));
    }
    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION)
        .then(a => agent = a)
        // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TestConstants.TEST_SCOUT_NAME, TEST_AGENT_KEY, appVersion))
        // Send application event with CPU sample
        .then(() => agent.sendAsync(new Requests.V1ApplicationEvent("application-event-test", types_1.ApplicationEventType.CPUUtilizationPercent, 10)))
        // Send application event with memory sample
        .then(() => agent.sendAsync(new Requests.V1ApplicationEvent("application-event-test", types_1.ApplicationEventType.MemoryUsageMB, 500)))
        .then(() => t.pass("async send did not fail"))
        // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});
test("Nested spans work (v1.2.7)", t => {
    const appVersion = new types_1.CoreAgentVersion(TestConstants.TEST_APP_VERSION);
    let agent;
    let reqStart;
    let childSpanStart;
    let parentSpanStart;
    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) {
        return t.end(new Error("TEST_AGENT_KEY ENV variable"));
    }
    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION)
        .then(a => agent = a)
        // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TestConstants.TEST_SCOUT_NAME, TEST_AGENT_KEY, appVersion))
        // Send StartRequest
        .then(() => {
        reqStart = new Requests.V1StartRequest();
        return agent.send(reqStart);
    })
        // Start a span (no parent)
        .then((resp) => {
        parentSpanStart = new Requests.V1StartSpan("test/start-span", reqStart.requestId);
        return agent.send(parentSpanStart);
    })
        .then((resp) => t.assert(resp.succeeded(), "start-span succeeded (parent)"))
        // Start a child span
        .then(() => {
        childSpanStart = new Requests.V1StartSpan("test/start-span", reqStart.requestId, { parentId: parentSpanStart.spanId });
        return agent.send(childSpanStart);
    })
        .then((resp) => t.assert(resp.succeeded(), "start-span succeeded (child)"))
        // Stop the child span
        .then(() => agent.send(new Requests.V1StopSpan(childSpanStart.spanId, childSpanStart.requestId)))
        .then((resp) => t.assert(resp.succeeded(), "stop-span succeeded (child)"))
        // Stop the parent span
        .then(() => agent.send(new Requests.V1StopSpan(parentSpanStart.spanId, parentSpanStart.requestId)))
        .then((resp) => t.assert(resp.succeeded(), "stop-span succeeded (parent)"))
        // Finish the request
        .then(() => agent.send(new Requests.V1FinishRequest(reqStart.requestId)))
        .then((resp) => t.assert(resp.succeeded(), "finish-request succeeded"))
        // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});
test("Nested spans work in the wrong close order (v1.2.7)", t => {
    const appVersion = new types_1.CoreAgentVersion(TestConstants.TEST_APP_VERSION);
    let agent;
    let reqStart;
    let childSpanStart;
    let parentSpanStart;
    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) {
        return t.end(new Error("TEST_AGENT_KEY ENV variable"));
    }
    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION)
        .then(a => agent = a)
        // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TestConstants.TEST_SCOUT_NAME, TEST_AGENT_KEY, appVersion))
        // Send StartRequest
        .then(() => {
        reqStart = new Requests.V1StartRequest();
        return agent.send(reqStart);
    })
        // Start a span (no parent)
        .then((resp) => {
        parentSpanStart = new Requests.V1StartSpan("test/start-span", reqStart.requestId);
        return agent.send(parentSpanStart);
    })
        .then((resp) => t.assert(resp.succeeded(), "start-span succeeded (parent)"))
        // Start a child span
        .then(() => {
        childSpanStart = new Requests.V1StartSpan("test/start-span", reqStart.requestId, { parentId: parentSpanStart.spanId });
        return agent.send(childSpanStart);
    })
        .then((resp) => t.assert(resp.succeeded(), "start-span succeeded (child)"))
        // Stop the parent span
        .then(() => agent.send(new Requests.V1StopSpan(parentSpanStart.spanId, parentSpanStart.requestId)))
        .then((resp) => t.assert(resp.succeeded(), "stop-span succeeded (parent)"))
        // Stop the child span
        .then(() => agent.send(new Requests.V1StopSpan(childSpanStart.spanId, childSpanStart.requestId)))
        .then((resp) => t.assert(resp.succeeded(), "stop-span succeeded (child)"))
        // Finish the request
        .then(() => agent.send(new Requests.V1FinishRequest(reqStart.requestId)))
        .then((resp) => t.assert(resp.succeeded(), "finish-request succeeded"))
        // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});
test("Request with 'Controller' span works, after waiting for flush (v1.2.7)", t => {
    const appVersion = new types_1.CoreAgentVersion(TestConstants.TEST_APP_VERSION);
    let agent;
    let reqStart;
    let spanStart;
    // Ensure agent key is present (fed in from ENV)
    if (!TEST_AGENT_KEY) {
        return t.end(new Error("TEST_AGENT_KEY ENV variable"));
    }
    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION)
        .then(a => agent = a)
        // Start the agent & connect to the local socket
        .then(() => TestUtil.initializeAgent(t, agent, TestConstants.TEST_SCOUT_NAME, TEST_AGENT_KEY, appVersion))
        // Send StartRequest
        .then(() => {
        reqStart = new Requests.V1StartRequest();
        return agent.send(reqStart);
    })
        // Start the controller span
        .then((resp) => {
        spanStart = new Requests.V1StartSpan("Controller/test", reqStart.requestId);
        return agent.send(spanStart);
    })
        .then((resp) => t.assert(resp.succeeded(), "start-span succeeded"))
        // Stop the span
        .then(() => agent.send(new Requests.V1StopSpan(spanStart.spanId, spanStart.requestId)))
        .then((resp) => t.assert(resp.succeeded(), "stop-span succeeded"))
        // Finish the request
        .then(() => agent.send(new Requests.V1FinishRequest(reqStart.requestId)))
        .then((resp) => t.assert(resp.succeeded(), "finish-request succeeded"))
        // Cleanup the process & end test
        .then(() => TestUtil.cleanup(t, agent))
        .catch(err => TestUtil.cleanup(t, agent, err));
});
test("Support starting scout with a completely external core-agent", t => {
    // Create the external process agent, with special function for building the proc opts with
    TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION, { buildProcOpts: (binPath, uri) => new types_1.ProcessOptions(binPath, uri, { disallowLaunch: true }) })
        // Attempt to shut down the agent immediately which shouldn't work because there is no process
        .then(agent => agent.getProcess())
        // Cleanup the process & end test
        .then(() => {
        t.fail("shutdown succeeded on an agent with no process");
        t.end();
    })
        .catch(err => {
        if (err instanceof Errors.NoProcessReference) {
            t.pass("NoProcessReference error was returned");
            t.end();
            return;
        }
        t.end(err);
    });
});
