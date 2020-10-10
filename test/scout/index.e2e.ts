import * as test from "tape";
import * as path from "path";
import { mkdtemp, ensureDir } from "fs-extra";
import * as os from "os";

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

import { getActiveGlobalScoutInstance, getOrCreateActiveGlobalScoutInstance } from "../../lib/global";

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

test("Request can be created and finished", t => {
    const scout = TestUtil.buildTestScoutInstance();

    let expectedRequestId: string;

    // Set up a listener for the scout request that gets sent
    const listener = (data: ScoutEventRequestSentData) => {
        if (!data.request) { return; }

        if (data.request.id !== expectedRequestId) { return; }
        t.pass("found single-span request w/ expected operation name");

        // Now that we've found our request for the transaction, stop listening
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Look up the database span from the request
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Set up listener on the agent
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Create the request
        .then(() => scout.transaction("test-request-create-and-finish", (done, {request}) => {
            if (!request) { throw new Error("request not present"); }
            expectedRequestId = request.id;
            t.pass(`transaction with id [${expectedRequestId}] started`);
            done();
        }))
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("Single span request", t => {
    const scout = TestUtil.buildTestScoutInstance();
    let req: ScoutRequest | null;
    let span: ScoutSpan | null;

    // Set up a listener for the scout request that gets sent
    const listener = (data: ScoutEventRequestSentData) => {
        if (!data.request) { return; }

        const spans = data.request.getChildSpansSync();
        if (!spans || spans.length !== 1) { return; }
        if (spans[0].operation !== "Controller/test") { return; }

        t.pass("found single-span request with Controller/test operation");

        // Now that we've seen our single span we can stop listening
        scout.removeListener(ScoutEvent.RequestSent, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Set up listener on the agent
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Create the request
        .then(() => scout.transaction("test-single-span-request", finishRequest => {
            return scout.instrument("Controller/test", stopSpan => {
                req = scout.getCurrentRequest();
                if (!req) { throw new Error("request missing"); }
                span = scout.getCurrentSpan();
                if (!span) { throw new Error("span missing"); }

                t.assert(span, "span was created");
                t.equals(span.requestId, req.id, "created span's request matches");
                // stop the span
                stopSpan();
            })
                .then(() => finishRequest());
        }))
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("Multi span request (2 top level)", t => {
    const scout = TestUtil.buildTestScoutInstance();

    const spans: ScoutSpan[] = [];

    // Set up a listener for the scout request that gets sent
    const listener = (data: ScoutEventRequestSentData) => {
        if (!data.request) { return; }

        const spans = data.request.getChildSpansSync();
        if (!spans || spans.length !== 2) { return; }

        t.pass("found two-span request");

        const first = spans.find(s => s.operation === "Controller/test.first");
        if (!first) { return; }
        t.pass("the first span is present");

        const second = spans.find(s => s.operation === "Controller/test.second");
        if (!second) { return; }
        t.pass("the second span is present");

        // Now that we've found our two span request
        scout.removeListener(ScoutEvent.RequestSent, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Set up listener on the agent
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Create the request
        .then(() => scout.transaction("test-multi-span-2-top-level", finishRequest => {
            // Create the first span
            return scout.instrument("Controller/test.first", stopSpan => {
                t.pass("first span ran");
                stopSpan();
            })
            // Create the second span
                .then(() => scout.instrument("Controller/test.second", stopSpan => {
                    t.pass("second span ran");
                    stopSpan();
                }))
            // Finish the request
                .then(() => finishRequest());
        }))
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("Multi span request (1 top level, 1 nested)", t => {
    const scout = TestUtil.buildTestScoutInstance();

    // Set up a listener for the scout request that gets sent
    const listener = (data: ScoutEventRequestSentData) => {
        if (!data.request) { return; }

        const spans = data.request.getChildSpansSync();
        if (!spans || spans.length !== 1) { return; }

        // Ensure top level span is stopped
        if (!spans[0].isStopped()) { return; }
        t.pass(`found single-span request w/ outer span (operation ${spans[0].operation} stopped`);
        t.equals(spans[0].operation, "Controller/test.first", "outer level span is correct");

        // Get children of first span
        const childSpans = spans[0].getChildSpansSync();
        if (childSpans.length !== 1) { return; }

        // Ensure child span is stopped too
        if (!childSpans[0].isStopped()) { return; }
        t.pass(`found single child span (operation ${childSpans[0].operation} is also stopped`);
        t.equals(childSpans[0].operation, "Controller/test.first.nested", "outer level span is correct");

        // Now that we've found our nested spans, we can stop listening
        scout.removeListener(ScoutEvent.RequestSent, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Set up listener on the agent
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Create the request
        .then(() => scout.transaction("test-multi-span-1-top-1-nested", finishRequest => {

            // Create the first span
            return scout.instrument("Controller/test.first", stopSpan => {
                return scout.instrument("Controller/test.first.nested", stopInnerSpan => {
                    stopInnerSpan();
                    stopSpan();
                });
            })
                .then(() => finishRequest());
        }))
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("Parent Span auto close works (1 top level, 1 nested)", t => {
    const scout = TestUtil.buildTestScoutInstance();

    // Set up a listener for the scout request that gets sent
    const listener = (data: ScoutEventRequestSentData) => {
        if (!data.request) { return; }

        const spans = data.request.getChildSpansSync();
        if (!spans || spans.length !== 1) { return; }

        // Ensure top level span is stopped
        if (!spans[0].isStopped()) { return; }
        t.pass(`found single-span request w/ outer span (operation ${spans[0].operation} stopped`);

        // Get children of first span
        const childSpans = spans[0].getChildSpansSync();
        if (childSpans.length !== 1) { return; }

        // Ensure child span is stopped too
        if (!childSpans[0].isStopped()) { return; }
        t.pass(`found single child span (operation ${childSpans[0].operation} is also stopped`);

        // Now that we've found our nested spans we can stop listening
        scout.removeListener(ScoutEvent.RequestSent, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Set up listener on the agent
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Create the request
        .then(() => scout.transaction("test-req-autoclose-1-top-1-nested", finishRequest => {
            // Create the first span
            return scout.instrument("Controller/test.first", stopSpan => {
                return scout.instrument("Controller/test.first.nested", stopInnerSpan => {
                    stopSpan();
                    t.pass("only the outer span is stopped");
                });
            })
                .then(() => finishRequest());
        }))
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("Request auto close works (1 top level, 1 nested)", t => {
    const scout = TestUtil.buildTestScoutInstance();

    // Set up a listener for the scout request that gets sent
    const listener = (data: ScoutEventRequestSentData) => {
        if (!data.request) { return; }

        const spans = data.request.getChildSpansSync();
        if (!spans || spans.length !== 1) { return; }

        // Ensure top level span is stopped
        if (!spans[0].isStopped()) { return; }
        t.pass(`found single-span request w/ outer span (operation ${spans[0].operation} stopped`);

        // Get children of first span
        const childSpans = spans[0].getChildSpansSync();
        if (childSpans.length !== 1) { return; }

        // Ensure child span is stopped too
        if (!childSpans[0].isStopped()) { return; }
        t.pass(`found single child span (operation ${childSpans[0].operation} is also stopped`);

        // Now that we've found our nested spans, we can stop listening
        scout.removeListener(ScoutEvent.RequestSent, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Set up listener on the agent
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Create the request
        .then(() => scout.transaction("test-req-autoclose-1-top-1-nested", finishRequest => {
            // Create the first span
            return scout.instrument("Controller/test.first", stopSpan => {
                return scout.instrument("Controller/test.first.nested", stopInnerSpan => {
                    t.pass("no spans are stopped");
                });
            })
                .then(() => finishRequest());
        }))
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("Request auto close works (2 top level)", t => {
    const scout = TestUtil.buildTestScoutInstance();

    // Set up a listener for the scout request that gets sent
    const listener = (data: ScoutEventRequestSentData) => {
        if (!data.request) { return; }

        const spans = data.request.getChildSpansSync();
        if (!spans || spans.length !== 2) { return; }

        t.pass("found request with 2 child spans");

        // Look up the database spans we expect to be in the request
        // if we don't find it, we must have picked up some *other* 2 span request
        const first = spans.find(s => s.operation === "Controller/test.first");
        const second = spans.find(s => s.operation === "Controller/test.second");
        if (!first || !second) { return; }

        t.assert(first, "the first span is present");
        t.assert(first.isStopped(), "first span is stopped");
        t.assert(second, "the second span is present");
        t.assert(second.isStopped(), "second span is stopped");

        // Since we've found our two-span request, stop listening
        scout.removeListener(ScoutEvent.RequestSent, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Set up listener on the agent
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Create the request
        .then(() => scout.transaction("test-req-autoclose-1-top-1-nested", finishRequest => {
            // Create the first span
            return scout.instrument("Controller/test.first", stopSpan => {
                t.pass("first instrument ran, and stop is called to finish it");
                stopSpan();
            })
            // Create second span
                .then(() => scout.instrument("Controller/test.second", stopSpan => {
                    t.pass("second instrument ran, but stop not called (will be stopped by req)");
                }))
            // Finish request
                .then(() => finishRequest());
        }))
    // Teardown and end test, if an error occurs
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/59
test("Download disabling works via top level config", t => {
    const config = buildScoutConfiguration({
        coreAgentDownload: false,
        allowShutdown: true,
        monitor: true,
    });
    const scout = new Scout(config, {downloadOptions: {disableCache: true}});

    scout
        .setup()
        .then(() => Promise.reject(new Error("Download failure expected since downloading is disabled")))
        .catch(err => {
            if (!(err instanceof ExternalDownloadDisallowed)) {
                return TestUtil.shutdownScout(t, scout, err);
            }

            t.pass("setup failed due to ExternalDownloadDisallowed error");
            return t.end();
        });
});

// https://github.com/scoutapp/scout_apm_node/issues/59
test("Launch disabling works via top level config", t => {

    const socketDir = path.join(os.tmpdir(), "core-agent-launch-disable-test");
    let scout: Scout;
    let socketPath: string;

    // Ensure a directoy to put the socket in exists
    ensureDir(socketDir)
        .then(() => {
            scout = new Scout(buildScoutConfiguration({
                coreAgentLaunch: false,
                allowShutdown: true,
                monitor: true,
                socketPath: `${socketDir}/core-agent.sock`,
            }));

            const filePath = scout.getSocketFilePath();
            if (!filePath) { throw new Error("unexpected/invalid non-unix socket path!"); }
            socketPath = filePath;
        })
    // We need to make sure that the socket path doesn't exist
        .then(() => pathExists(socketPath))
        .then(exists => {
            if (exists) {
                t.comment(`removing existing socket path @ [${socketPath}] to prevent use of existing agent`);
                return remove(socketPath);
            }
        })
    // Setup scout
        .then(() => scout.setup())
        .then(() => {
            throw new Error("Agent launch failure expected since launching is disabled");
        })
        .catch(err => {
            // These errors should occur when scout tries to send with the bad socketPath
            // after not being allowed to launch
            const isExpectedError = [
                AgentLaunchDisabled,
                NoAgentPresent,
                InvalidConfiguration,
            ].some(v => err instanceof v);

            // If AgentLaunchDisabled wasn't the error, this was a failure
            if (isExpectedError) {
                t.pass("setup failed due to LaunchDisabled error");
                return t.end();
            }

            return TestUtil.shutdownScout(t, scout, err);
        });
});

// https://github.com/scoutapp/scout_apm_node/issues/59
test("Custom version specification works via top level config", t => {
    const scout = new Scout(buildScoutConfiguration({
        coreAgentVersion: "v1.1.8", // older version (default is newer)
        allowShutdown: true,
        monitor: true,
    }));

    scout
        .setup()
        .then(() => {
            t.pass("setup succeeded with older version");
            t.equals(scout.getCoreAgentVersion().raw, "1.1.8", "correct version has been used");
        })
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/61
test("Application metadata is built and sent", t => {
    const appMeta = new ApplicationMetadata({
        frameworkVersion: "framework-version-from-app-meta",
    });

    const config = buildScoutConfiguration(
        {allowShutdown: true, monitor: true, coreAgentLaunch: true},
        {
            env: {
                SCOUT_FRAMEWORK: "framework-from-env",
                SCOUT_FRAMEWORK_VERSION: "framework-version-from-env",
            },
        },
    );

    const scout = new Scout(config, {
        appMeta,
        // Set statistics interval to 1s since we'll have to wait *one* interval
        // before scout can shutdown, since scout starts then quits immediately
        statisticsIntervalMS: 100,
    });

    // Check that the applicationMetdata has values overlaid
    const returnedAppMeta = scout.getApplicationMetadata();

    t.equals(returnedAppMeta.framework, "framework-from-env", "framework value is from env");
    t.equals(
        returnedAppMeta.frameworkVersion,
        "framework-version-from-app-meta",
        "framework version is from user-provided app meta",
    );
    t.equals(returnedAppMeta.languageVersion, process.version, "processVersion was populated from nodejs");

    // Create a listener to watch for the request sent through the inner agent
    const listener = (message: BaseAgentRequest) => {
        // Ignore requests that are sent that aren't span starts
        if (!message || message.type !== AgentRequestType.V1ApplicationEvent) { return; }

        // Skip requests that aren't the application event we expect to be sent by setup()
        const msg: V1ApplicationEvent = message as V1ApplicationEvent;
        if (msg.eventType !== "scout.metadata") { return; }

        // Ensure that the span is what we expect
        t.pass("application event was sent");
        t.equals(msg.eventType, ApplicationEventType.ScoutMetadata, "eventType is scout metadata");

        // Remove agent, pass test
        scout.removeListener(AgentEvent.RequestSent, listener);

        // Wait a little while for request to finish up, then shutdown
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Set up listener on the agent
    scout.on(AgentEvent.RequestSent, listener);

    scout
    // Setup should end up sending the Application metadata
        .setup()
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/70
test("Multiple ongoing requests are possible at the same time", t => {
    const scout = TestUtil.buildTestScoutInstance();
    let expectedRequestIds: string[] = [];
    const requests: ScoutRequest[] = [];

    // Set up a listener for the scout request that gets sent
    const listener = (data: ScoutEventRequestSentData) => {
        if (!data.request) { return; }

        // Ensure either test.first or test.second is contained in the operation
        if (!expectedRequestIds.includes(data.request.id)) { return; }

        // Add the matching request
        requests.push(data.request);

        // Return early until the second request
        if (requests.length !== 2) { return; }

        t.pass("two independent requests with the expected IDs were recorded");

        // Since we've found the two independent requests we're looking for, stop listening
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Look up the database span from the request
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Set up listener on the agent
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Create the first & second request
        .then(() => {
            // Start tarnsaction that will finish in 300ms
            scout.transaction("Controller/test.first", (done, {request}) => {
                if (!request) { throw new Error("request object missing"); }
                expectedRequestIds.push(request.id);

                TestUtil.waitMs(300)
                    .then(() => done());
            });

            // Start overlapping transaction that will finish in 100ms
            scout.transaction("Controller/test.second", (done, {request}) => {
                if (!request) { throw new Error("request object missing"); }
                expectedRequestIds.push(request.id);
                done();
            });
        })
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/72
test("Ensure that no requests are received by the agent if monitoring is off", t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: false,
    }));

    // Fail the test if a request is sent from the agent
    scout.on(ScoutAgentEvent.RequestSent, (req) => {
        t.fail("agent sent a request");
    });

    scout
        .setup()
    // Create the first & second request
        .then(() => scout.transaction("Controller/test-no-requests-when-monitoring-off", done => {
            t.pass("transaction started");
            done();

            TestUtil
                .shutdownScout(t, scout)
                .then(() => t.pass("shutdown ran"));
        }))
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/139
test("socketPath setting is honored by scout instance", t => {
    let scout: Scout;

    // Create a temp directory with a socket for scout to use
    mkdtemp("/tmp/socketpath-config-test-")
        .then(dir => path.join(dir, "core-agent.sock"))
        .then(socketPath => {
            // Create the scout instance with the custom socketPath
            scout = new Scout(buildScoutConfiguration({
                allowShutdown: true,
                monitor: false,
                coreAgentLaunch: false,
                coreAgentDownload: false,
                socketPath,
            }));

            t.equals(scout.getSocketFilePath(), socketPath, "socket path matches the custom value");
            t.end();
        });
});

// https://github.com/scoutapp/scout_apm_node/issues/142
test("Ignored requests are not sent", t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: false,
    }));

    // Fail the test if a request is sent from the agent
    scout.on(ScoutAgentEvent.RequestSent, (req) => {
        t.fail("Agent sent a request, it should have skipped");
    });

    // Pick up on the ignored request processing skipped event
    scout.on(ScoutEvent.IgnoredRequestProcessingSkipped, (skippedReq) => {
        t.equals(req.id, skippedReq.id, "skipped request matches what was passed");

        TestUtil.shutdownScout(t, scout);
    });

    let req: ScoutRequest;

    scout
        .setup()
    // Create the first & second request
        .then(() => scout.transaction("Controller/test-ignored-request-not-sent", (done, {request}) => {
            if (!request) { throw new Error("request not present"); }

            // Save the request ofr future validation
            req = request;

            // Ignore the request;
            request.ignore();

            t.pass("request ignored");
            done();
        }))
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/141
test("export WebTransaction is working", t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    const expectedSpanName = "Controller/test-web-transaction-export";

    const listener = (data: ScoutEventRequestSentData) => {
        if (!data.request) { return; }

        const spans = data.request.getChildSpansSync();
        if (!spans || spans.length !== 1) { return; }

        if (spans[0].operation !== expectedSpanName) { return; }

        t.pass(`observed single-span request with span name [${expectedSpanName}]`);

        // Since we've observed what we want we can stop listening
        scout.removeListener(ScoutEvent.RequestSent, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Fail the test if a request is sent from the agent
    scout.on(ScoutEvent.RequestSent, listener);

    // The scout object should be created as sa result of doing the .run
    scoutExport.api.WebTransaction
        .run(
            "test-web-transaction-export",
            (done, {request}) => {
                t.pass("transaction was run");
                done();
            },
            scout,
        )
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/141
test("export BackgroundTransaction is working", t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    const expectedSpanName = "Job/test-background-transaction-export";

    const listener = (data: ScoutEventRequestSentData) => {
        if (!data.request) { return; }

        const spans = data.request.getChildSpansSync();
        if (!spans || spans.length !== 1) { return; }

        // If the operation of the top span isn't the expected name, then return
        if (spans[0].operation !== expectedSpanName) { return; }
        t.pass(`found single span request with operation name matching [${expectedSpanName}]`);

        // Since we've found the request we expected we can stop looking
        scout.removeListener(ScoutEvent.RequestSent, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Fail the test if a request is sent from the agent
    scout.on(ScoutEvent.RequestSent, listener);

    // The scout object should be created as sa result of doing the .run
    scoutExport.api.BackgroundTransaction
        .run(
            "test-background-transaction-export",
            (done, {request}) => {
                t.pass("transaction was run");
                done();
            },
            scout,
        )
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/141
test("export Context.add add context (provided scout instance)", t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    const listener = (data: ScoutEventRequestSentData) => {
        if (!data.request) { return; }

        const val = data.request.getContextValue("testKey");
        if (!val || val != "testValue") { return; }

        t.pass("observed request context key [testKey] and value [testValue]");

        // Since we found the request with the context we want, we can stop listening
        scout.removeListener(ScoutEvent.RequestSent, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Fail the test if a request is sent from the agent
    scout.on(ScoutEvent.RequestSent, listener);

    // The scout object should be created as sa result of doing the .run
    scoutExport.api.WebTransaction.run(
        "test-web-transaction-export",
        (done, {request}) => {
            t.pass("transaction was run");
            // Add context
            return scoutExport.api.Context
                .add("testKey", "testValue", scout)
                .then(() => done());
        },
        scout,
    )
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/141
test("export Context.addSync to add context (provided scout instance)", t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    // TS cannot know that runSync will modify this synchronously
    // so we use any to force the runtime check
    let req: any;

    // The scout object should be created as sa result of doing the .run
    scoutExport.api.WebTransaction.runSync("test-web-transaction-export", ({request}) => {
        t.pass("transaction was run");
        req = request;
        scoutExport.api.Context.addSync("testKey", "testValue", scout);
    }, scout);

    if (!req) {
        throw new Error("req not saved");
    }

    t.equals(req.getContextValue("testKey"), "testValue", "request context was updated");
    t.end();
});

// https://github.com/scoutapp/scout_apm_node/issues/152
test("export ignoreTransaction successfully ignores transaction (provided scout instance)", t => {

    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    const listener = (data: ScoutEventRequestSentData) => {
        scout.removeListener(ScoutEvent.IgnoredRequestProcessingSkipped, listener);
        t.pass("ignored request's processing was skipped");

        TestUtil.shutdownScout(t, scout);
    };

    scout.on(ScoutEvent.IgnoredRequestProcessingSkipped, listener);

    // Teardown and end test
    // The scout object should be created as sa result of doing the .run
    scout
        .setup()
        .then(scout => {
            scoutExport.api.WebTransaction.run(
                "test-web-transaction-export",
                (done) => {
                    // Ignore the transaction
                    return scoutExport.api.ignoreTransaction(scout)
                        .then(() => t.pass("ignoreTransaction completed"))
                        .then(() => done());
                },
                scout,
            );
        })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/152
test("export ignoreTransactionSync successfully ignores transaction (provided scout instance)", t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    // TS cannot know that runSync will modify this synchronously
    // so we use any to force the runtime check
    let req: any;

    scout
        .setup()
        .then(scout => {
            // The scout object should be created as sa result of doing the .run
            scoutExport.api.WebTransaction.runSync("test-web-transaction-export", ({request}) => {
                t.pass("transaction was run");
                req = request;

                // Ignore the current request
                scoutExport.api.ignoreTransactionSync(scout);
            }, scout);

            t.assert(req.isIgnored(), "request is ignored");

            return TestUtil.shutdownScout(t, scout);

        });
});

// https://github.com/scoutapp/scout_apm_node/issues/171
test("Adding context does not cause socket close", t => {
    // We'll need to create a config to use with the global scout instance
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });

    const scout = new Scout(config);

    const listener = (data: ScoutEventRequestSentData) => {
        if (!data.request) { return; }

        const val = data.request.getContextValue("test");
        if (!val) { return; }

        // Since we've seen the context value we expect, then we can stop listening
        scout.removeListener(ScoutEvent.RequestSent, listener);

        t.equals(val, "test", "context value was saved");

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Fail the test if a request is sent from the agent
    scout.on(ScoutEvent.RequestSent, listener);

    // Create scout instance
    scout
        .setup()
        .then(() => {
            // The scout object should be created as sa result of doing the .run
            scout.transactionSync("test-web-transaction-export", ({request}) => {
                if (!request) {
                    throw new Error("request is missing inside transactionSync");
                }
                t.pass("transaction was run");

                // Add some context
                request.addContext("test", "test");
            });
        });
});

// https://github.com/scoutapp/scout_apm_node/issues/186
test("instrumentSync should automatically create a transaction", t => {
    // We'll need to create a config to use with the global scout instance
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });

    const scout = new Scout(config);

    const opName = "test-instrument-sync-auto-create-transaction";

    const listener = (data: ScoutEventRequestSentData) => {
        const spans = data.request.getChildSpansSync();
        if (!spans) { return; }

        const tSpan = spans.find(s => s.operation === opName);
        if (!tSpan) { return; }

        t.pass(`found span with expected operation name [${opName}]`)

        // Since we've found the span we're looking for we can stop listening
        scout.removeListener(ScoutEvent.RequestSent, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Fail the test if a request is sent from the agent
    scout.on(ScoutEvent.RequestSent, listener);

    // Create scout instance
    scout
        .setup()
        .then(() => {
            // The scout object should be created as a result of doing the .run
            scout.instrumentSync(opName, ({request}) => {
                if (!request) {
                    throw new Error("request is missing inside transactionSync");
                }
                t.pass("instrument was run");
            });
        });
});

// https://github.com/scoutapp/scout_apm_node/issues/120
test("CPU and memory stats should be sent periodically", t => {
    const appMeta = new ApplicationMetadata({
        frameworkVersion: "framework-version-from-app-meta",
    });

    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        coreAgentLaunch: true,
    });

    const scout = new Scout(config, {
        appMeta,
        statisticsIntervalMS: 1000,
    });

    // Watch for both CPU and memory metrics to be emitted
    const observed = {
        cpu: false,
        memory: false,
    };

    // Create a listener to watch for the request sent through the inner agent
    const listener = (message: BaseAgentRequest) => {
        // Ignore requests that are sent that aren't span starts
        if (!message || message.type !== AgentRequestType.V1ApplicationEvent) { return; }

        // Skip requests that aren't the application event we expect to be sent by setup()
        const msg: V1ApplicationEvent = message as V1ApplicationEvent;

        // Ensure that the span is what we expect
        if (msg.eventType === ApplicationEventType.CPUUtilizationPercent) {
            observed.cpu = true;
            t.pass("CPU usage message observed");
        }

        if (msg.eventType === ApplicationEventType.MemoryUsageMB) {
            observed.memory = true;
            t.pass("Memory usage message observed");
        }

        // Don't clean up the listener and shut down until we have seen both
        if (!observed.cpu || !observed.memory) { return; }
        t.pass("both CPU and memory metric have been observed");

        // Remove agent, pass test
        scout.removeListener(AgentEvent.RequestSent, listener);

        // Wait a little while for request to finish up, then shutdown
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Set up listener on the agent, not scout
    scout.on(AgentEvent.RequestSent, listener);

    scout
    // Setup should end up sending the Application metadata
        .setup()
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

///////////////////////////
// Global instance tests //
///////////////////////////

// https://github.com/scoutapp/scout_apm_node/issues/152
test("export ignoreTransactionSync successfully ignores transaction (global scout instance)", t => {
    // We'll need to create a config to use with the global scout instance
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });

    let req: ScoutRequest;
    let scout: Scout;

    getOrCreateActiveGlobalScoutInstance(config)
        .then(s => {
            // Save the global scout instance
            scout = s;

            // The scout object should be created as sa result of doing the .run
            scoutExport.api.WebTransaction.runSync("test-web-transaction-export", ({request}) => {
                t.pass("transaction was run");
                req = request;

                // ignore the current request
                scoutExport.api.ignoreTransactionSync();
            });

            t.assert(req.isIgnored(), "request is ignored");

            // We cannot shutdown the the global instance
            t.end();
        })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/141
test("export Context.addSync to add context (global scout instance)", t => {
    // We'll need to create a config to use with the global scout instance
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });

    // TS cannot know that runSync will modify this synchronously
    // so we use any to force the runtime check
    let req: any;
    let scout: Scout;

    getOrCreateActiveGlobalScoutInstance(config)
        .then(s => {
            // Save the global scout instance
            scout = s;

            // The scout object should be created as sa result of doing the .run
            scoutExport.api.WebTransaction.runSync("test-web-transaction-export", ({request}) => {
                t.pass("transaction was run");
                req = request;
                scoutExport.api.Context.addSync("testKey", "testValue");
            });

            if (!req) {
                t.fail("request was not saved");
            }

            t.equals(req.getContextValue("testKey"), "testValue", "request context was updated");

            // We cannot shutdown the the global instance
            t.end();
        })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/152
test("export ignoreTransaction successfully ignores transaction (global scout instance)", t => {
    // We'll need to create a config to use with the global scout instance
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });

    getOrCreateActiveGlobalScoutInstance(config)
        .then(scout => {
            const listener = () => {
                scout.removeListener(ScoutEvent.IgnoredRequestProcessingSkipped, listener);
                t.pass("ignored request's processing was skipped");

                // The global instance should not shut down
                t.end();
            };

            // Fail the test if a request is sent from the agent
            scout.on(ScoutEvent.IgnoredRequestProcessingSkipped, listener);

            // The scout object should be created as sa result of doing the .run
            scoutExport.api.WebTransaction.run(
                "test-web-transaction-export",
                (done) => {
                    // Ignore the transaction
                    return scoutExport.api.ignoreTransaction()
                        .then(() => t.pass("ignoreTransaction completed"))
                        .then(() => done());
                },
            );
        });
});

// https://github.com/scoutapp/scout_apm_node/issues/141
test("export Context.add add context (global scout instance)", t => {
    // We'll need to create a config to use with the global scout instance
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });

    getOrCreateActiveGlobalScoutInstance(config)
        .then(scout => {
            const listener = (data: ScoutEventRequestSentData) => {
                scout.removeListener(ScoutEvent.RequestSent, listener);

                const req = data.request;
                const val = req.getContextValue("testKey");
                t.equals(val, "testValue", "context value was saved");

                // NOTE: we cannot shut down the global instance here
                t.end();
            };

            // Fail the test if a request is sent from the agent
            scout.on(ScoutEvent.RequestSent, listener);

            // The scout object should be created as sa result of doing the .run
            scoutExport.api.WebTransaction.run(
                "test-web-transaction-export",
                (done, {request}) => {
                    t.pass("transaction was run");
                    // Add context
                    return scoutExport.api.Context
                        .add("testKey", "testValue")
                        .then(() => done());
                },
            );
        });
});

// https://github.com/scoutapp/scout_apm_node/issues/141
test("export Config returns a populated special object", t => {
    // We'll need to create a config to use with the global scout instance
    const config = buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    });

    let scout: Scout;

    getOrCreateActiveGlobalScoutInstance(config)
        .then(s => {
            scout = s;

            const config = scoutExport.api.Config;
            if (!config) { throw new Error("config is undefined"); }

            t.assert(config.coreAgentVersion, "core agent version is set");
            t.assert(config.coreAgentLogLevel, "core agent log level is set");

            // We cannot shutdown the the global instance
            t.end();
        })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// Cleanup the global isntance(s) that get created
test("Shutdown the global instance", t => {
    const inst = getActiveGlobalScoutInstance();
    if (inst) { return TestUtil.shutdownScout(t, inst); }
    t.end();
});
