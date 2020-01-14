import * as test from "tape";

import {
    ScoutAgentEvent,
    AgentLaunchDisabled,
    ApplicationMetadata,
    ExternalDownloadDisallowed,
    LogLevel,
    Scout,
    ScoutRequest,
    ScoutEvent,
    ScoutSpan,
    buildScoutConfiguration,
    consoleLogFn,
} from "../lib";

import { ScoutEventRequestSentData } from "../lib/scout";

import { BaseAgentRequest, AgentRequestType, AgentEvent, ApplicationEventType, ScoutContextNames } from "../lib/types";
import { V1ApplicationEvent } from "../lib/protocol/v1/requests";

import { pathExists, remove } from "fs-extra";

import * as TestUtil from "./util";

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

    // Set up a listener for the scout request that gets sent
    const listener = (data: ScoutEventRequestSentData) => {
        scout.removeListener(ScoutEvent.RequestSent, listener);

        t.assert(data.request, "request is present");
        // Look up the database span from the request
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Set up listener on the agent
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Create the request
        .then(() => scout.transaction("test-request-create-and-finish", done => {
            t.pass("transaction started");
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
        scout.removeListener(ScoutEvent.RequestSent, listener);

        if (!data.request) {
            throw new Error("request missing");
        }

        // Look up the database span from the request
        data.request
            .getChildSpans()
            .then(spans => t.equals(spans.length, 1, "there is one child span"))
            .then(() => TestUtil.shutdownScout(t, scout))
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
                t.equals(span.request.id, req.id, "created span's request matches");
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
        scout.removeListener(ScoutEvent.RequestSent, listener);

        if (!data.request) { throw new Error("request missing"); }

        // Look up the database span from the request
        data.request
            .getChildSpans()
            .then(spans => {
                t.equals(spans.length, 2, "there are two child spans");
                t.assert(spans.find(s => s.operation === "Controller/test.first"), "the first span is present");
                t.assert(spans.find(s => s.operation === "Controller/test.second"), "the second span is present");
            })
            .then(() => TestUtil.shutdownScout(t, scout))
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
        scout.removeListener(ScoutEvent.RequestSent, listener);

        if (!data.request) { throw new Error("request missing"); }

        // Look up the database span from the request
        data.request
            .getChildSpans()
            .then(spans => {
                t.equals(spans.length, 1, "there is one span");
                t.equals(spans[0].operation, "Controller/test.first", "outer level span is correct");
                return spans[0].getChildSpans();
            })
        // Ensure span has one inner child
            .then(innerSpans => {
                t.equals(innerSpans.length, 1, "there is one span");
                t.equals(innerSpans[0].operation, "Controller/test.first.nested", "outer level span is correct");
            })
            .then(() => TestUtil.shutdownScout(t, scout))
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
        scout.removeListener(ScoutEvent.RequestSent, listener);

        if (!data.request) { throw new Error("request missing"); }

        // Look up the database span from the request
        data.request
            .getChildSpans()
            .then(spans => {
                t.assert(spans[0].isStopped(), "outer level span is stopped");
                return spans[0].getChildSpans();
            })
        // Ensure span has one inner child
            .then(innerSpans => t.assert(innerSpans[0].isStopped(), "nested span is stopped"))
            .then(() => TestUtil.shutdownScout(t, scout))
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
        scout.removeListener(ScoutEvent.RequestSent, listener);

        if (!data.request) { throw new Error("request missing"); }

        // Look up the database span from the request
        data.request
            .getChildSpans()
            .then(spans => {
                t.assert(spans[0].isStopped(), "outer level span is stopped");
                return spans[0].getChildSpans();
            })
        // Ensure span has one inner child
            .then(innerSpans => t.assert(innerSpans[0].isStopped(), "nested span is stopped"))
            .then(() => TestUtil.shutdownScout(t, scout))
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
        scout.removeListener(ScoutEvent.RequestSent, listener);

        if (!data.request) { throw new Error("request missing"); }

        // Look up the database span from the request
        data.request
            .getChildSpans()
            .then(spans => {
                t.equals(spans.length, 2, "there is one span");
                const first = spans.find(s => s.operation === "Controller/test.first");
                if (!first) { throw new Error("first span missing"); }
                t.assert(first, "the first span is present");
                t.assert(first.isStopped(), "first span is stopped");

                const second = spans.find(s => s.operation === "Controller/test.second");
                if (!second) { throw new Error("second span missing"); }
                t.assert(second, "the second span is present");
                t.assert(second.isStopped(), "second span is stopped");
            })
        // Ensure span has one inner child
            .then(() => TestUtil.shutdownScout(t, scout))
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
    const scout = new Scout(buildScoutConfiguration({
        coreAgentLaunch: false,
        allowShutdown: true,
        monitor: true,
    }));

    const socketPath = scout.getSocketFilePath();

    // We need to make sure that the socket path doesn't exist
    pathExists(socketPath)
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
            if (!(err instanceof AgentLaunchDisabled)) {
                return TestUtil.shutdownScout(t, scout, err);
            }

            t.pass("setup failed due to LaunchDisabled error");
            return t.end();
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

    const scout = new Scout(config, {appMeta});

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
        scout.removeListener(ScoutEvent.RequestSent, listener);

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
    const requests: ScoutRequest[] = [];

    // Set up a listener for the scout request that gets sent
    const listener = (data: ScoutEventRequestSentData) => {
        requests.push(data.request);

        // Return early until the second request
        if (requests.length !== 2) { return; }

        t.equals(requests.length, 2, "two requests were recorded");

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
            scout.transaction("Controller/test.first", done => {
                TestUtil.waitMs(300)
                    .then(() => done());
            });

            // Start overlapping transaction that will finish in 100ms
            scout.transaction("Controller/test.first", done => {
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

// https://github.com/scoutapp/scout_apm_node/issues/76
test("spans should have traces attached", t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    // Set up a listener for the scout request that gets sent
    const listener = (data: ScoutEventRequestSentData) => {
        const request = data.request;

        scout.removeListener(ScoutEvent.RequestSent, listener);

        data.request
            .getChildSpans()
            .then(spans => {
                t.equals(spans.length, 1, "one span was present");
                const stackJson = spans[0].getContextValue(ScoutContextNames.Traceback);
                t.assert(stackJson, "traceback context is present on span");

                const stack = JSON.parse(stackJson || "[]");
                t.equals(stack.find(s => s.file.includes("scout_apm_node")), undefined, "no scout APM traces");
            })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Set up listener on the agent
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Create the first & second request
        .then(() => scout.transaction("Controller/test-span-trace", finishRequest => {
            return scout.instrument("test-span-trace", stopSpan => {
                t.pass("span ran");
            })
                .then(() => finishRequest());
        }))
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
