"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tape_1 = __importDefault(require("tape"));
const fs_extra_1 = require("fs-extra");
const path = __importStar(require("path"));
const Errors = __importStar(require("../../lib/errors"));
const TestUtil = __importStar(require("../util"));
const Fixtures = __importStar(require("../fixtures"));
const types_1 = require("../../lib/types");
const Requests = __importStar(require("../../lib/protocol/v1/requests"));
const TestConstants = __importStar(require("../constants"));
const TEST_AGENT_KEY = process.env.TEST_AGENT_KEY || "fake-agent-key";
const SKIP_BINARY_TESTS = process.env.ENABLE_BINARY_TESTS !== "true";
(0, tape_1.default)(`external process can be launched locally (v${TestConstants.TEST_APP_VERSION})`, { skip: SKIP_BINARY_TESTS }, t => {
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
(0, tape_1.default)(`manual async GetVersion message works (v${TestConstants.TEST_APP_VERSION})`, { skip: SKIP_BINARY_TESTS }, t => {
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
            t.equals(resp.version.raw, TestConstants.TEST_APP_VERSION, `parsed response version matches (v${TestConstants.TEST_APP_VERSION})`);
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
(0, tape_1.default)(`GetVersion message works (v${TestConstants.TEST_APP_VERSION})`, { skip: SKIP_BINARY_TESTS }, t => {
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
(0, tape_1.default)(`Register message works (v${TestConstants.TEST_APP_VERSION})`, { skip: SKIP_BINARY_TESTS }, t => {
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
(0, tape_1.default)(`StartRequest message works (v${TestConstants.TEST_APP_VERSION})`, { skip: SKIP_BINARY_TESTS }, t => {
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
(0, tape_1.default)(`FinishRequest message works (v${TestConstants.TEST_APP_VERSION})`, { skip: SKIP_BINARY_TESTS }, t => {
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
(0, tape_1.default)(`TagRequest message works (v${TestConstants.TEST_APP_VERSION})`, { skip: SKIP_BINARY_TESTS }, t => {
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
(0, tape_1.default)(`StartSpan message works for leaf span (v${TestConstants.TEST_APP_VERSION})`, { skip: SKIP_BINARY_TESTS }, t => {
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
(0, tape_1.default)(`StopSpan works for leaf span (v${TestConstants.TEST_APP_VERSION})`, { skip: SKIP_BINARY_TESTS }, t => {
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
(0, tape_1.default)(`TagSpan works for leaf span (v${TestConstants.TEST_APP_VERSION})`, { skip: SKIP_BINARY_TESTS }, t => {
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
(0, tape_1.default)(`ApplicationEvent for application metadata works (v${TestConstants.TEST_APP_VERSION})`, { skip: SKIP_BINARY_TESTS }, t => {
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
(0, tape_1.default)(`ApplicationEvent for sampling works (v${TestConstants.TEST_APP_VERSION})`, { skip: SKIP_BINARY_TESTS }, t => {
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
(0, tape_1.default)(`Nested spans work (v${TestConstants.TEST_APP_VERSION})`, { skip: SKIP_BINARY_TESTS }, t => {
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
(0, tape_1.default)(`Nested spans work in the wrong close order (v${TestConstants.TEST_APP_VERSION})`, { skip: SKIP_BINARY_TESTS }, t => {
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
(0, tape_1.default)(`Request with 'Controller' span works, after waiting for flush (v${TestConstants.TEST_APP_VERSION})`, { skip: SKIP_BINARY_TESTS }, t => {
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
(0, tape_1.default)("Support starting scout with a completely external core-agent", { skip: SKIP_BINARY_TESTS }, t => {
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
(0, tape_1.default)("Timeout agent messages", { skip: SKIP_BINARY_TESTS }, t => {
    let agent;
    // When the server receives a message, it should increment the count
    let tmpSocketPath;
    const [socketServer, shutdownSocketServer] = TestUtil.createClientCollectingServer();
    // Create a temp directory for the do-nothing server's socket
    (0, fs_extra_1.mkdtemp)("/tmp/timeout-test-")
        .then(dir => tmpSocketPath = path.join(dir, "core-agent.sock"))
        // Create the socket server that will count connections
        .then(() => socketServer.listen(tmpSocketPath))
        // Create the external process agent, configured to not launch
        .then(() => TestUtil.bootstrapExternalProcessAgent(t, TestConstants.TEST_APP_VERSION, { buildProcOpts: (binPath, uri) => new types_1.ProcessOptions(binPath, `unix://${tmpSocketPath}`, { disallowLaunch: true, sendTimeoutMs: 100 }) }))
        .then(a => agent = a)
        // Connect the agent
        .then(() => agent.connect())
        // Since we have the agent connected to a server that does nothing with messages,
        // sending a start request shoudl time out since it will wait for a well-formed response
        .then(() => agent.send(new Requests.V1StartRequest()))
        // Cleanup the process & end test
        .then(() => {
        t.fail("agent should have thrown a timeout error after 500ms");
        t.end();
    })
        .catch(err => {
        // If we get the TimeoutError, pass the test and close the socket server
        if (err instanceof Errors.TimeoutError) {
            t.pass("TimeoutError was returned");
            t.end();
            // Disconnect all the clients and close the server
            shutdownSocketServer();
            return;
        }
        // If an unexpected error happened shutdown the socket server and end the test
        shutdownSocketServer();
        t.end(err);
    });
});
