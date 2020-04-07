import * as test from "tape";
import * as path from "path";
import { mkdtemp } from "fs-extra";

import {
    Scout,
    ScoutRequest,
    ScoutSpan,
    ScoutEventRequestSentData,
} from "../../lib/scout";

import {
    BaseAgentRequest,
    AgentRequestType,
    AgentEvent,
    ApplicationEventType,
    ScoutContextName,
    JSONValue,
    ApplicationMetadata,
    LogLevel,
    buildScoutConfiguration,
    consoleLogFn,
    ScoutEvent,
    AgentEvent as ScoutAgentEvent,
} from "../../lib/types";

import { getOrCreateGlobalScoutInstance } from "../../lib/global";

import {
    AgentLaunchDisabled,
    ExternalDownloadDisallowed,
    InvalidConfiguration,
    NoAgentPresent,
} from "../../lib/errors";

import { V1ApplicationEvent } from "../../lib/protocol/v1/requests";

import { pathExists, remove } from "fs-extra";

import * as TestUtil from "../util";

const scoutExport = require("../../lib");

test("Scout object creation works without config", t => {
    const scout = new Scout();
    t.assert(scout, "scout object was created");
    t.end();
});

test("Scout object setup works without config", t => {
    const scout = TestUtil.buildTestScoutInstance();

    scout
        .setup()
        .then(scout => t.assert(scout, "scout object was successfully set up"))
    // Teardown and end test
        .then(() => scout.shutdown())
        .then(() => t.end())
        .catch(t.end);
});

// test("Request can be created and finished", t => {
//     const scout = TestUtil.buildTestScoutInstance();

//     // Set up a listener for the scout request that gets sent
//     const listener = (data: ScoutEventRequestSentData) => {
//         scout.removeListener(ScoutEvent.RequestSent, listener);

//         t.assert(data.request, "request is present");
//         // Look up the database span from the request
//         TestUtil.shutdownScout(t, scout)
//             .catch(err => TestUtil.shutdownScout(t, scout, err));
//     };

//     // Set up listener on the agent
//     scout.on(ScoutEvent.RequestSent, listener);

//     scout
//         .setup()
//     // Create the request
//         .then(() => scout.transaction("test-request-create-and-finish", done => {
//             t.pass("transaction started");
//             done();
//         }))
//     // Teardown and end test
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// test("Single span request", t => {
//     const scout = TestUtil.buildTestScoutInstance();
//     let req: ScoutRequest | null;
//     let span: ScoutSpan | null;

//     // Set up a listener for the scout request that gets sent
//     const listener = (data: ScoutEventRequestSentData) => {
//         scout.removeListener(ScoutEvent.RequestSent, listener);

//         if (!data.request) {
//             throw new Error("request missing");
//         }

//         // Look up the database span from the request
//         data.request
//             .getChildSpans()
//             .then(spans => t.equals(spans.length, 1, "there is one child span"))
//             .then(() => TestUtil.shutdownScout(t, scout))
//             .catch(err => TestUtil.shutdownScout(t, scout, err));
//     };

//     // Set up listener on the agent
//     scout.on(ScoutEvent.RequestSent, listener);

//     scout
//         .setup()
//     // Create the request
//         .then(() => scout.transaction("test-single-span-request", finishRequest => {
//             return scout.instrument("Controller/test", stopSpan => {
//                 req = scout.getCurrentRequest();
//                 if (!req) { throw new Error("request missing"); }
//                 span = scout.getCurrentSpan();
//                 if (!span) { throw new Error("span missing"); }

//                 t.assert(span, "span was created");
//                 t.equals(span.request.id, req.id, "created span's request matches");
//                 // stop the span
//                 stopSpan();
//             })
//                 .then(() => finishRequest());
//         }))
//     // Teardown and end test
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// test("Multi span request (2 top level)", t => {
//     const scout = TestUtil.buildTestScoutInstance();

//     const spans: ScoutSpan[] = [];

//     // Set up a listener for the scout request that gets sent
//     const listener = (data: ScoutEventRequestSentData) => {
//         scout.removeListener(ScoutEvent.RequestSent, listener);

//         if (!data.request) { throw new Error("request missing"); }

//         // Look up the database span from the request
//         data.request
//             .getChildSpans()
//             .then(spans => {
//                 t.equals(spans.length, 2, "there are two child spans");
//                 t.assert(spans.find(s => s.operation === "Controller/test.first"), "the first span is present");
//                 t.assert(spans.find(s => s.operation === "Controller/test.second"), "the second span is present");
//             })
//             .then(() => TestUtil.shutdownScout(t, scout))
//             .catch(err => TestUtil.shutdownScout(t, scout, err));
//     };

//     // Set up listener on the agent
//     scout.on(ScoutEvent.RequestSent, listener);

//     scout
//         .setup()
//     // Create the request
//         .then(() => scout.transaction("test-multi-span-2-top-level", finishRequest => {
//             // Create the first span
//             return scout.instrument("Controller/test.first", stopSpan => {
//                 t.pass("first span ran");
//                 stopSpan();
//             })
//             // Create the second span
//                 .then(() => scout.instrument("Controller/test.second", stopSpan => {
//                     t.pass("second span ran");
//                     stopSpan();
//                 }))
//             // Finish the request
//                 .then(() => finishRequest());
//         }))
//     // Teardown and end test
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// test("Multi span request (1 top level, 1 nested)", t => {
//     const scout = TestUtil.buildTestScoutInstance();

//     // Set up a listener for the scout request that gets sent
//     const listener = (data: ScoutEventRequestSentData) => {
//         scout.removeListener(ScoutEvent.RequestSent, listener);

//         if (!data.request) { throw new Error("request missing"); }

//         // Look up the database span from the request
//         data.request
//             .getChildSpans()
//             .then(spans => {
//                 t.equals(spans.length, 1, "there is one span");
//                 t.equals(spans[0].operation, "Controller/test.first", "outer level span is correct");
//                 return spans[0].getChildSpans();
//             })
//         // Ensure span has one inner child
//             .then(innerSpans => {
//                 t.equals(innerSpans.length, 1, "there is one span");
//                 t.equals(innerSpans[0].operation, "Controller/test.first.nested", "outer level span is correct");
//             })
//             .then(() => TestUtil.shutdownScout(t, scout))
//             .catch(err => TestUtil.shutdownScout(t, scout, err));
//     };

//     // Set up listener on the agent
//     scout.on(ScoutEvent.RequestSent, listener);

//     scout
//         .setup()
//     // Create the request
//         .then(() => scout.transaction("test-multi-span-1-top-1-nested", finishRequest => {

//             // Create the first span
//             return scout.instrument("Controller/test.first", stopSpan => {
//                 return scout.instrument("Controller/test.first.nested", stopInnerSpan => {
//                     stopInnerSpan();
//                     stopSpan();
//                 });
//             })
//                 .then(() => finishRequest());
//         }))
//     // Teardown and end test
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// test("Parent Span auto close works (1 top level, 1 nested)", t => {
//     const scout = TestUtil.buildTestScoutInstance();

//     // Set up a listener for the scout request that gets sent
//     const listener = (data: ScoutEventRequestSentData) => {
//         scout.removeListener(ScoutEvent.RequestSent, listener);

//         if (!data.request) { throw new Error("request missing"); }

//         // Look up the database span from the request
//         data.request
//             .getChildSpans()
//             .then(spans => {
//                 t.assert(spans[0].isStopped(), "outer level span is stopped");
//                 return spans[0].getChildSpans();
//             })
//         // Ensure span has one inner child
//             .then(innerSpans => t.assert(innerSpans[0].isStopped(), "nested span is stopped"))
//             .then(() => TestUtil.shutdownScout(t, scout))
//             .catch(err => TestUtil.shutdownScout(t, scout, err));
//     };

//     // Set up listener on the agent
//     scout.on(ScoutEvent.RequestSent, listener);

//     scout
//         .setup()
//     // Create the request
//         .then(() => scout.transaction("test-req-autoclose-1-top-1-nested", finishRequest => {
//             // Create the first span
//             return scout.instrument("Controller/test.first", stopSpan => {
//                 return scout.instrument("Controller/test.first.nested", stopInnerSpan => {
//                     stopSpan();
//                     t.pass("only the outer span is stopped");
//                 });
//             })
//                 .then(() => finishRequest());
//         }))
//     // Teardown and end test
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// test("Request auto close works (1 top level, 1 nested)", t => {
//     const scout = TestUtil.buildTestScoutInstance();

//     // Set up a listener for the scout request that gets sent
//     const listener = (data: ScoutEventRequestSentData) => {
//         scout.removeListener(ScoutEvent.RequestSent, listener);

//         if (!data.request) { throw new Error("request missing"); }

//         // Look up the database span from the request
//         data.request
//             .getChildSpans()
//             .then(spans => {
//                 t.assert(spans[0].isStopped(), "outer level span is stopped");
//                 return spans[0].getChildSpans();
//             })
//         // Ensure span has one inner child
//             .then(innerSpans => t.assert(innerSpans[0].isStopped(), "nested span is stopped"))
//             .then(() => TestUtil.shutdownScout(t, scout))
//             .catch(err => TestUtil.shutdownScout(t, scout, err));
//     };

//     // Set up listener on the agent
//     scout.on(ScoutEvent.RequestSent, listener);

//     scout
//         .setup()
//     // Create the request
//         .then(() => scout.transaction("test-req-autoclose-1-top-1-nested", finishRequest => {
//             // Create the first span
//             return scout.instrument("Controller/test.first", stopSpan => {
//                 return scout.instrument("Controller/test.first.nested", stopInnerSpan => {
//                     t.pass("no spans are stopped");
//                 });
//             })
//                 .then(() => finishRequest());
//         }))
//     // Teardown and end test
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// test("Request auto close works (2 top level)", t => {
//     const scout = TestUtil.buildTestScoutInstance();

//     // Set up a listener for the scout request that gets sent
//     const listener = (data: ScoutEventRequestSentData) => {
//         scout.removeListener(ScoutEvent.RequestSent, listener);

//         if (!data.request) { throw new Error("request missing"); }

//         // Look up the database span from the request
//         data.request
//             .getChildSpans()
//             .then(spans => {
//                 t.equals(spans.length, 2, "there is one span");
//                 const first = spans.find(s => s.operation === "Controller/test.first");
//                 if (!first) { throw new Error("first span missing"); }
//                 t.assert(first, "the first span is present");
//                 t.assert(first.isStopped(), "first span is stopped");

//                 const second = spans.find(s => s.operation === "Controller/test.second");
//                 if (!second) { throw new Error("second span missing"); }
//                 t.assert(second, "the second span is present");
//                 t.assert(second.isStopped(), "second span is stopped");
//             })
//         // Ensure span has one inner child
//             .then(() => TestUtil.shutdownScout(t, scout))
//             .catch(err => TestUtil.shutdownScout(t, scout, err));
//     };

//     // Set up listener on the agent
//     scout.on(ScoutEvent.RequestSent, listener);

//     scout
//         .setup()
//     // Create the request
//         .then(() => scout.transaction("test-req-autoclose-1-top-1-nested", finishRequest => {
//             // Create the first span
//             return scout.instrument("Controller/test.first", stopSpan => {
//                 t.pass("first instrument ran, and stop is called to finish it");
//                 stopSpan();
//             })
//             // Create second span
//                 .then(() => scout.instrument("Controller/test.second", stopSpan => {
//                     t.pass("second instrument ran, but stop not called (will be stopped by req)");
//                 }))
//             // Finish request
//                 .then(() => finishRequest());
//         }))
//     // Teardown and end test, if an error occurs
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// // https://github.com/scoutapp/scout_apm_node/issues/59
// test("Download disabling works via top level config", t => {
//     const config = buildScoutConfiguration({
//         coreAgentDownload: false,
//         allowShutdown: true,
//         monitor: true,
//     });
//     const scout = new Scout(config, {downloadOptions: {disableCache: true}});

//     scout
//         .setup()
//         .then(() => Promise.reject(new Error("Download failure expected since downloading is disabled")))
//         .catch(err => {
//             if (!(err instanceof ExternalDownloadDisallowed)) {
//                 return TestUtil.shutdownScout(t, scout, err);
//             }

//             t.pass("setup failed due to ExternalDownloadDisallowed error");
//             return t.end();
//         });
// });

// // https://github.com/scoutapp/scout_apm_node/issues/59
// test("Launch disabling works via top level config", t => {
//     const scout = new Scout(buildScoutConfiguration({
//         coreAgentLaunch: false,
//         allowShutdown: true,
//         monitor: true,
//     }));

//     const socketPath = scout.getSocketFilePath();

//     // We need to make sure that the socket path doesn't exist
//     pathExists(socketPath)
//         .then(exists => {
//             if (exists) {
//                 t.comment(`removing existing socket path @ [${socketPath}] to prevent use of existing agent`);
//                 return remove(socketPath);
//             }
//         })
//     // Setup scout
//         .then(() => scout.setup())
//         .then(() => {
//             throw new Error("Agent launch failure expected since launching is disabled");
//         })
//         .catch(err => {
//             // These errors should occur when scout tries to send with the bad socketPath
//             // after not being allowed to launch
//             const isExpectedError = [
//                 AgentLaunchDisabled,
//                 NoAgentPresent,
//                 InvalidConfiguration,
//             ].some(v => err instanceof v);

//             // If AgentLaunchDisabled wasn't the error, this was a failure
//             if (isExpectedError) {
//                 t.pass("setup failed due to LaunchDisabled error");
//                 return t.end();
//             }

//             return TestUtil.shutdownScout(t, scout, err);
//         });
// });

// // https://github.com/scoutapp/scout_apm_node/issues/59
// test("Custom version specification works via top level config", t => {
//     const scout = new Scout(buildScoutConfiguration({
//         coreAgentVersion: "v1.1.8", // older version (default is newer)
//         allowShutdown: true,
//         monitor: true,
//     }));

//     scout
//         .setup()
//         .then(() => {
//             t.pass("setup succeeded with older version");
//             t.equals(scout.getCoreAgentVersion().raw, "1.1.8", "correct version has been used");
//         })
//         .then(() => TestUtil.shutdownScout(t, scout))
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// // https://github.com/scoutapp/scout_apm_node/issues/61
// test("Application metadata is built and sent", t => {
//     const appMeta = new ApplicationMetadata({
//         frameworkVersion: "framework-version-from-app-meta",
//     });

//     const config = buildScoutConfiguration(
//         {allowShutdown: true, monitor: true, coreAgentLaunch: true},
//         {
//             env: {
//                 SCOUT_FRAMEWORK: "framework-from-env",
//                 SCOUT_FRAMEWORK_VERSION: "framework-version-from-env",
//             },
//         },
//     );

//     const scout = new Scout(config, {appMeta});

//     // Check that the applicationMetdata has values overlaid
//     const returnedAppMeta = scout.getApplicationMetadata();

//     t.equals(returnedAppMeta.framework, "framework-from-env", "framework value is from env");
//     t.equals(
//         returnedAppMeta.frameworkVersion,
//         "framework-version-from-app-meta",
//         "framework version is from user-provided app meta",
//     );
//     t.equals(returnedAppMeta.languageVersion, process.version, "processVersion was populated from nodejs");

//     // Create a listener to watch for the request sent through the inner agent
//     const listener = (message: BaseAgentRequest) => {
//         // Ignore requests that are sent that aren't span starts
//         if (!message || message.type !== AgentRequestType.V1ApplicationEvent) { return; }

//         // Skip requests that aren't the application event we expect to be sent by setup()
//         const msg: V1ApplicationEvent = message as V1ApplicationEvent;
//         if (msg.eventType !== "scout.metadata") { return; }

//         // Ensure that the span is what we expect
//         t.pass("application event was sent");
//         t.equals(msg.eventType, ApplicationEventType.ScoutMetadata, "eventType is scout metadata");

//         // Remove agent, pass test
//         scout.removeListener(ScoutEvent.RequestSent, listener);

//         // Wait a little while for request to finish up, then shutdown
//         TestUtil.shutdownScout(t, scout)
//             .catch(err => TestUtil.shutdownScout(t, scout, err));
//     };

//     // Set up listener on the agent
//     scout.on(AgentEvent.RequestSent, listener);

//     scout
//     // Setup should end up sending the Application metadata
//         .setup()
//     // Teardown and end test
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// // https://github.com/scoutapp/scout_apm_node/issues/70
// test("Multiple ongoing requests are possible at the same time", t => {
//     const scout = TestUtil.buildTestScoutInstance();
//     const requests: ScoutRequest[] = [];

//     // Set up a listener for the scout request that gets sent
//     const listener = (data: ScoutEventRequestSentData) => {
//         requests.push(data.request);

//         // Return early until the second request
//         if (requests.length !== 2) { return; }

//         t.equals(requests.length, 2, "two requests were recorded");

//         scout.removeListener(ScoutEvent.RequestSent, listener);

//         // Look up the database span from the request
//         TestUtil.shutdownScout(t, scout)
//             .catch(err => TestUtil.shutdownScout(t, scout, err));
//     };

//     // Set up listener on the agent
//     scout.on(ScoutEvent.RequestSent, listener);

//     scout
//         .setup()
//     // Create the first & second request
//         .then(() => {
//             // Start tarnsaction that will finish in 300ms
//             scout.transaction("Controller/test.first", done => {
//                 TestUtil.waitMs(300)
//                     .then(() => done());
//             });

//             // Start overlapping transaction that will finish in 100ms
//             scout.transaction("Controller/test.first", done => {
//                 done();
//             });
//         })
//     // Teardown and end test
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// // https://github.com/scoutapp/scout_apm_node/issues/72
// test("Ensure that no requests are received by the agent if monitoring is off", t => {
//     const scout = new Scout(buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: false,
//     }));

//     // Fail the test if a request is sent from the agent
//     scout.on(ScoutAgentEvent.RequestSent, (req) => {
//         t.fail("agent sent a request");
//     });

//     scout
//         .setup()
//     // Create the first & second request
//         .then(() => scout.transaction("Controller/test-no-requests-when-monitoring-off", done => {
//             t.pass("transaction started");
//             done();

//             TestUtil
//                 .shutdownScout(t, scout)
//                 .then(() => t.pass("shutdown ran"));
//         }))
//     // Teardown and end test
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// // https://github.com/scoutapp/scout_apm_node/issues/139
// test("socketPath setting is honored by scout instance", t => {
//     let scout: Scout;

//     // Create a temp directory with a socket for scout to use
//     mkdtemp("/tmp/socketpath-config-test-")
//         .then(dir => path.join(dir, "core-agent.sock"))
//         .then(socketPath => {
//             // Create the scout instance with the custom socketPath
//             scout = new Scout(buildScoutConfiguration({
//                 allowShutdown: true,
//                 monitor: false,
//                 coreAgentLaunch: false,
//                 coreAgentDownload: false,
//                 socketPath,
//             }));

//             t.equals(scout.getSocketFilePath(), socketPath, "socket path matches the custom value");
//             t.end();
//         });
// });

// // https://github.com/scoutapp/scout_apm_node/issues/142
// test("Ignored requests are not sent", t => {
//     const scout = new Scout(buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: false,
//     }));

//     // Fail the test if a request is sent from the agent
//     scout.on(ScoutAgentEvent.RequestSent, (req) => {
//         t.fail("Agent sent a request, it should have skipped");
//     });

//     // Pick up on the ignored request processing skipped event
//     scout.on(ScoutEvent.IgnoredRequestProcessingSkipped, (skippedReq) => {
//         t.equals(req.id, skippedReq.id, "skipped request matches what was passed");

//         TestUtil.shutdownScout(t, scout);
//     });

//     let req: ScoutRequest;

//     scout
//         .setup()
//     // Create the first & second request
//         .then(() => scout.transaction("Controller/test-ignored-request-not-sent", (done, {request}) => {
//             if (!request) { throw new Error("request not present"); }

//             // Save the request ofr future validation
//             req = request;

//             // Ignore the request;
//             request.ignore();

//             t.pass("request ignored");
//             done();
//         }))
//     // Teardown and end test
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// // https://github.com/scoutapp/scout_apm_node/issues/141
// test("export WebTransaction is working", t => {
//     const scout = new Scout(buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     }));

//     const expectedSpanName = "Controller/test-web-transaction-export";

//     const listener = (data: ScoutEventRequestSentData) => {
//         scout.removeListener(ScoutEvent.RequestSent, listener);

//         const req = data.request;

//         const innerSpans = req.getChildSpansSync();
//         t.assert(innerSpans.length === 1, "one inner span was present");
//         if (!innerSpans || innerSpans.length !== 1) {
//             throw new Error("Single inner top level span not present");
//         }

//         const topLevelInnerSpan = innerSpans[0];
//         t.equals(topLevelInnerSpan.operation, expectedSpanName, `span name is [${expectedSpanName}]`);

//         TestUtil.shutdownScout(t, scout);
//     };

//     // Fail the test if a request is sent from the agent
//     scout.on(ScoutEvent.RequestSent, listener);

//     // The scout object should be created as sa result of doing the .run
//     scoutExport.api.WebTransaction
//         .run(
//             "test-web-transaction-export",
//             (done, {request}) => {
//                 t.pass("transaction was run");
//                 done();
//             },
//             scout,
//         )
//     // Teardown and end test
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// // https://github.com/scoutapp/scout_apm_node/issues/141
// test("export BackgroundTransaction is working", t => {
//     const scout = new Scout(buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     }));

//     const expectedSpanName = "Job/test-background-transaction-export";

//     const listener = (data: ScoutEventRequestSentData) => {
//         scout.removeListener(ScoutEvent.RequestSent, listener);

//         const req = data.request;

//         const innerSpans = req.getChildSpansSync();
//         t.assert(innerSpans.length === 1, "one inner span was present");
//         if (!innerSpans || innerSpans.length !== 1) {
//             throw new Error("Single inner top level span not present");
//         }

//         const topLevelInnerSpan = innerSpans[0];
//         t.equals(topLevelInnerSpan.operation, expectedSpanName, `span name is [${expectedSpanName}]`);

//         TestUtil.shutdownScout(t, scout);
//     };

//     // Fail the test if a request is sent from the agent
//     scout.on(ScoutEvent.RequestSent, listener);

//     // The scout object should be created as sa result of doing the .run
//     scoutExport.api.BackgroundTransaction
//         .run(
//             "test-background-transaction-export",
//             (done, {request}) => {
//                 t.pass("transaction was run");
//                 done();
//             },
//             scout,
//         )
//     // Teardown and end test
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// // https://github.com/scoutapp/scout_apm_node/issues/141
// test("export Config returns a populated special object", t => {
//     // We'll need to create a config to use with the global scout instance
//     const config = buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     });

//     getOrCreateGlobalScoutInstance(config)
//         .then(scout => {
//             const config = scoutExport.api.Config;
//             if (!config) { throw new Error("config is undefined"); }

//             t.assert(config.coreAgentVersion, "core agent version is set");
//             t.assert(config.coreAgentLogLevel, "core agent log level is set");

//             return TestUtil.shutdownScout(t, scout);
//         });
// });

// // https://github.com/scoutapp/scout_apm_node/issues/141
// test("export Context.add add context (provided scout instance)", t => {
//     const scout = new Scout(buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     }));

//     const listener = (data: ScoutEventRequestSentData) => {
//         scout.removeListener(ScoutEvent.RequestSent, listener);

//         const req = data.request;
//         const val = req.getContextValue("testKey");
//         t.equals(val, "testValue", "context value was saved");

//         TestUtil.shutdownScout(t, scout);
//     };

//     // Fail the test if a request is sent from the agent
//     scout.on(ScoutEvent.RequestSent, listener);

//     // The scout object should be created as sa result of doing the .run
//     scoutExport.api.WebTransaction.run(
//         "test-web-transaction-export",
//         (done, {request}) => {
//             t.pass("transaction was run");
//             // Add context
//             return scoutExport.api.Context
//                 .add("testKey", "testValue", scout)
//                 .then(() => done());
//         },
//         scout,
//     )
//     // Teardown and end test
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// // https://github.com/scoutapp/scout_apm_node/issues/141
// test("export Context.add add context (global scout instance)", t => {
//     // We'll need to create a config to use with the global scout instance
//     const config = buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     });

//     getOrCreateGlobalScoutInstance(config)
//         .then(scout => {
//             const listener = (data: ScoutEventRequestSentData) => {
//                 scout.removeListener(ScoutEvent.RequestSent, listener);

//                 const req = data.request;
//                 const val = req.getContextValue("testKey");
//                 t.equals(val, "testValue", "context value was saved");

//                 TestUtil.shutdownScout(t, scout);
//             };

//             // Fail the test if a request is sent from the agent
//             scout.on(ScoutEvent.RequestSent, listener);

//             // The scout object should be created as sa result of doing the .run
//             scoutExport.api.WebTransaction.run(
//                 "test-web-transaction-export",
//                 (done, {request}) => {
//                     t.pass("transaction was run");
//                     // Add context
//                     return scoutExport.api.Context
//                         .add("testKey", "testValue")
//                         .then(() => done());
//                 },
//             );
//         });
// });

// // https://github.com/scoutapp/scout_apm_node/issues/141
// test("export Context.addSync to add context (provided scout instance)", t => {
//     const scout = new Scout(buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     }));

//     // TS cannot know that runSync will modify this synchronously
//     // so we use any to force the runtime check
//     let req: any;

//     // The scout object should be created as sa result of doing the .run
//     scoutExport.api.WebTransaction.runSync("test-web-transaction-export", ({request}) => {
//         t.pass("transaction was run");
//         req = request;
//         scoutExport.api.Context.addSync("testKey", "testValue", scout);
//     }, scout);

//     if (!req) {
//         throw new Error("req not saved");
//     }

//     t.equals(req.getContextValue("testKey"), "testValue", "request context was updated");
//     t.end();
// });

// // https://github.com/scoutapp/scout_apm_node/issues/141
// test("export Context.addSync to add context (global scout instance)", t => {
//     // We'll need to create a config to use with the global scout instance
//     const config = buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     });

//     // TS cannot know that runSync will modify this synchronously
//     // so we use any to force the runtime check
//     let req: any;

//     getOrCreateGlobalScoutInstance(config)
//         .then(scout => {
//             // The scout object should be created as sa result of doing the .run
//             scoutExport.api.WebTransaction.runSync("test-web-transaction-export", ({request}) => {
//                 t.pass("transaction was run");
//                 req = request;
//                 scoutExport.api.Context.addSync("testKey", "testValue");
//             });

//             if (!req) {
//                 return TestUtil.shutdownScout(t, scout, new Error("req not saved"));
//             }

//             t.equals(req.getContextValue("testKey"), "testValue", "request context was updated");

//             return TestUtil.shutdownScout(t, scout);
//         });
// });

// // https://github.com/scoutapp/scout_apm_node/issues/152
// test("export ignoreTransaction successfully ignores transaction (global scout instance)", t => {
//     // We'll need to create a config to use with the global scout instance
//     const config = buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     });

//     getOrCreateGlobalScoutInstance(config)
//         .then(scout => {
//             const listener = () => {
//                 scout.removeListener(ScoutEvent.IgnoredRequestProcessingSkipped, listener);
//                 t.pass("ignored request's processing was skipped");

//                 TestUtil.shutdownScout(t, scout);
//             };

//             // Fail the test if a request is sent from the agent
//             scout.on(ScoutEvent.IgnoredRequestProcessingSkipped, listener);

//             // The scout object should be created as sa result of doing the .run
//             scoutExport.api.WebTransaction.run(
//                 "test-web-transaction-export",
//                 (done) => {
//                     // Ignore the transaction
//                     return scoutExport.api.ignoreTransaction()
//                         .then(() => t.pass("ignoreTransaction completed"))
//                         .then(() => done());
//                 },
//             );
//         });
// });

// // https://github.com/scoutapp/scout_apm_node/issues/152
// test("export ignoreTransaction successfully ignores transaction (provided scout instance)", t => {

//     const scout = new Scout(buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     }));

//     const listener = (data: ScoutEventRequestSentData) => {
//         scout.removeListener(ScoutEvent.IgnoredRequestProcessingSkipped, listener);
//         t.pass("ignored request's processing was skipped");

//         TestUtil.shutdownScout(t, scout);
//     };

//     scout.on(ScoutEvent.IgnoredRequestProcessingSkipped, listener);

//     // Teardown and end test
//     // The scout object should be created as sa result of doing the .run
//     scout
//         .setup()
//         .then(scout => {
//             scoutExport.api.WebTransaction.run(
//                 "test-web-transaction-export",
//                 (done) => {
//                     // Ignore the transaction
//                     return scoutExport.api.ignoreTransaction(scout)
//                         .then(() => t.pass("ignoreTransaction completed"))
//                         .then(() => done());
//                 },
//                 scout,
//             );
//         })
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });

// // https://github.com/scoutapp/scout_apm_node/issues/152
// test("export ignoreTransactionSync successfully ignores transaction (provided scout instance)", t => {
//     const scout = new Scout(buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     }));

//     // TS cannot know that runSync will modify this synchronously
//     // so we use any to force the runtime check
//     let req: any;

//     scout
//         .setup()
//         .then(scout => {
//             // The scout object should be created as sa result of doing the .run
//             scoutExport.api.WebTransaction.runSync("test-web-transaction-export", ({request}) => {
//                 t.pass("transaction was run");
//                 req = request;

//                 // Ignore the current request
//                 scoutExport.api.ignoreTransactionSync(scout);
//             }, scout);

//             t.assert(req.isIgnored(), "request is ignored");

//             return TestUtil.shutdownScout(t, scout);

//         });
// });

// // https://github.com/scoutapp/scout_apm_node/issues/152
// test("export ignoreTransactionSync successfully ignores transaction (global scout instance)", t => {
//     // We'll need to create a config to use with the global scout instance
//     const config = buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     });

//     let req: ScoutRequest;

//     getOrCreateGlobalScoutInstance(config)
//         .then(scout => {
//             // The scout object should be created as sa result of doing the .run
//             scoutExport.api.WebTransaction.runSync("test-web-transaction-export", ({request}) => {
//                 t.pass("transaction was run");
//                 req = request;

//                 // ignore the current request
//                 scoutExport.api.ignoreTransactionSync();
//             });

//             t.assert(req.isIgnored(), "request is ignored");

//             return TestUtil.shutdownScout(t, scout);
//         });
// });

// // https://github.com/scoutapp/scout_apm_node/issues/171
// test("Adding context does not cause socket close", t => {
//     // We'll need to create a config to use with the global scout instance
//     const config = buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: true,
//     });

//     const scout = new Scout(config);

//     const listener = (data: ScoutEventRequestSentData) => {
//         scout.removeListener(ScoutEvent.RequestSent, listener);

//         const req = data.request;
//         const val = req.getContextValue("test");
//         t.equals(val, "test", "context value was saved");

//         TestUtil.shutdownScout(t, scout);
//     };

//     // Fail the test if a request is sent from the agent
//     scout.on(ScoutEvent.RequestSent, listener);

//     // Create scout instance
//     scout
//         .setup()
//         .then(() => {
//             // The scout object should be created as sa result of doing the .run
//             scout.transactionSync("test-web-transaction-export", ({request}) => {
//                 if (!request) {
//                     throw new Error("request is missing inside transactionSync");
//                 }
//                 t.pass("transaction was run");

//                 // Add some context
//                 request.addContext("test", "test");
//             });
//         });
// });
