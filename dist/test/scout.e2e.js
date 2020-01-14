"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const lib_1 = require("../lib");
const TestUtil = require("./util");
test("Scout object creation works without config", t => {
    const scout = new lib_1.Scout();
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
//     let req: ScoutRequest;
//     scout
//         .setup()
//     // Create the request
//         .then(() => scout.startRequest())
//         .then(r => {
//             t.assert(r, "request was created");
//             req = r;
//         })
//     // Finish & send the request
//         .then(() => req.finishAndSend())
//         .then(returned => {
//             t.assert(returned, "request was finished");
//             t.equals(returned.id, req.id, "request id matches what was returned by finish()");
//         })
//     // Teardown and end test
//         .then(() => TestUtil.shutdownScout(t, scout))
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });
// test("Single span request", t => {
//     const scout = TestUtil.buildTestScoutInstance();
//     let req: ScoutRequest;
//     let span: ScoutSpan;
//     scout
//         .setup()
//     // Create the request
//         .then(() => scout.startRequest())
//         .then(r => req = r)
//     // Add a span to the request
//         .then(() => req.startChildSpan("Controller/test"))
//         .then(s => {
//             t.assert(s, "span was created");
//             t.equals(s.request.id, req.id, "created span's request matches");
//             span = s;
//         })
//     // Finish the span
//         .then(() => span.stop()) // span.finish() would work too
//         .then(returnedSpan => {
//             t.assert(returnedSpan, "span was finished");
//             t.equals(returnedSpan.id, span.id, "span id matches what was returned by finish()");
//         })
//     // Finish & Send the request
//         .then(() => req.finishAndSend())
//     // Teardown and end test
//         .then(() => TestUtil.shutdownScout(t, scout))
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });
// test("Multi span request (2 top level)", t => {
//     const scout = TestUtil.buildTestScoutInstance();
//     const spans: ScoutSpan[] = [];
//     let req: ScoutRequest;
//     scout
//         .setup()
//     // Create the request
//         .then(() => scout.startRequest())
//         .then(r => req = r)
//     // Add the first span
//         .then(() => req.startChildSpan("Controller/test.first"))
//         .then(s => spans.push(s))
//         .then(() => TestUtil.waitMs(100))
//     // Add the second span
//         .then(() => req.startChildSpan("Controller/test.second"))
//         .then(s => spans.push(s))
//     // Finish the spans
//         .then(() => Promise.all(spans.map(s => s.stop())))
//     // Ensure the spans are marked as stopped
//         .then(returnedSpan => {
//             t.assert(spans.every(s => s.isStopped()), "spans are stopped");
//             t.assert(!req.isStopped(), "request is not stopped yet");
//         })
//     // Finish & send the request
//         .then(() => req.finishAndSend())
//         .then(() => t.assert(req.isStopped(), "request is stopped"))
//     // Teardown and end test
//         .then(() => TestUtil.shutdownScout(t, scout))
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });
// test("Multi span request (1 top level, 1 nested)", t => {
//     const scout = TestUtil.buildTestScoutInstance();
//     let req: ScoutRequest;
//     let parent: ScoutSpan;
//     let child: ScoutSpan;
//     scout
//         .setup()
//     // Create the request
//         .then(() => scout.startRequest())
//         .then(r => req = r)
//     // Add the first span
//         .then(() => req.startChildSpan("Controller/test.first"))
//         .then(s => parent = s)
//         .then(() => TestUtil.waitMs(100))
//     // Add the second (nested) span
//         .then(() => parent.startChildSpan("Controller/test.first.nested"))
//         .then(s => child = s)
//     // Finish the child span (but not the parent)
//         .then(() => child.finish())
//     // Ensure the child span is stopped but the parent isn't
//         .then(returnedSpan => {
//             t.equals(returnedSpan.id, child.id, "returned span id is the child");
//             t.assert(child.isStopped(), "child span is stopped");
//             t.assert(!parent.isStopped(), "parent span is not stopped yet");
//             t.assert(!req.isStopped(), "request is not stopped yet");
//         })
//     // Finish the parent span
//         .then(() => parent.finish())
//         .then(returnedSpan => {
//             t.assert(parent.isStopped(), "parent span is not stopped yet");
//             t.assert(!req.isStopped(), "request is not stopped yet");
//         })
//     // Send & Finish the request
//         .then(() => req.finishAndSend())
//         .then(() => t.assert(req.isStopped(), "request is stopped"))
//     // Teardown and end test
//         .then(() => TestUtil.shutdownScout(t, scout))
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });
// test("Parent Span auto close works (1 top level, 1 nested)", t => {
//     const scout = TestUtil.buildTestScoutInstance();
//     let req: ScoutRequest;
//     let parent: ScoutSpan;
//     let child: ScoutSpan;
//     scout
//         .setup()
//     // Create the request
//         .then(() => scout.startRequest())
//         .then(r => req = r)
//     // Add the first span
//         .then(() => req.startChildSpan("Controller/test.first"))
//         .then(s => parent = s)
//         .then(() => TestUtil.waitMs(100))
//     // Add the second (nested) span
//         .then(() => parent.startChildSpan("Controller/test.first.nested"))
//         .then(s => child = s)
//     // Finish the parent span (this should trigger the child span being finished as well)
//         .then(() => parent.finish())
//     // Ensure the child span is stopped but the parent isn't
//         .then(returnedSpan => {
//             t.equals(returnedSpan.id, parent.id, "returned span id is the parent");
//             t.assert(child.isStopped(), "child span is stopped");
//             t.assert(parent.isStopped(), "parent span is stopped");
//             t.assert(!req.isStopped(), "request is not stopped yet");
//         })
//     // Finish & send the request
//         .then(() => req.finishAndSend())
//         .then(() => t.assert(req.isStopped(), "request is stopped"))
//     // Teardown and end test
//         .then(() => TestUtil.shutdownScout(t, scout))
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });
// test("Request auto close works (1 top level, 1 nested)", t => {
//     const scout = TestUtil.buildTestScoutInstance();
//     let req: ScoutRequest;
//     let parent: ScoutSpan;
//     let child: ScoutSpan;
//     scout
//         .setup()
//     // Create the request
//         .then(() => scout.startRequest())
//         .then(r => req = r)
//     // Add the first span
//         .then(() => req.startChildSpan("Controller/test.first"))
//         .then(s => parent = s)
//         .then(() => TestUtil.waitMs(100))
//     // Add the second (nested) span
//         .then(() => parent.startChildSpan("Controller/test.first.nested"))
//         .then(s => child = s)
//     // Finish & send the request (should trigger all spans below to finish)
//         .then(() => req.finishAndSend())
//     // Ensure the child span is stopped but the parent isn't
//         .then(returnedReq => {
//             t.equals(returnedReq.id, req.id, "returned request id matches");
//             t.assert(child.isStopped(), "child span is stopped");
//             t.assert(parent.isStopped(), "parent span is stopped");
//             t.assert(req.isStopped(), "request is stopped");
//         })
//     // Teardown and end test
//         .then(() => TestUtil.shutdownScout(t, scout))
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });
// test("Request auto close works (2 top level)", t => {
//     const scout = TestUtil.buildTestScoutInstance();
//     let req: ScoutRequest;
//     const spans: ScoutSpan[] = [];
//     scout
//         .setup()
//     // Create the request
//         .then(() => scout.startRequest())
//         .then(r => req = r)
//     // Add the first span
//         .then(() => req.startChildSpan("Controller/test.first"))
//         .then(s => spans.push(s))
//         .then(() => TestUtil.waitMs(100))
//     // Add the second span
//         .then(() => req.startChildSpan("Controller/test.second"))
//         .then(s => spans.push(s))
//     // Finish the request (triggering spans being finished)
//         .then(() => req.stop())
//     // Ensure the child span is stopped but the parent isn't
//         .then(returnedReq => {
//             t.assert(spans.every(s => s.isStopped()), "all spans are stopped");
//             t.equals(spans.length, 2, "2 spans were created");
//             t.assert(req.isStopped(), "request is stopped");
//         })
//     // Teardown and end test
//         .then(() => TestUtil.shutdownScout(t, scout))
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
//     scout
//         .setup()
//         .then(() => Promise.reject(new Error("Agent launch failure expected since launching is disabled")))
//         .catch(err => {
//             if (!(err instanceof AgentLaunchDisabled)) {
//                 return TestUtil.shutdownScout(t, scout, err);
//             }
//             t.pass("setup failed due to LaunchDisabled error");
//             return t.end();
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
//         {allowShutdown: true, monitor: true},
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
//     let req: ScoutRequest;
//     scout
//     // Setup should end up sending the Application metadata
//         .setup()
//     // Create the request
//         .then(() => scout.startRequest())
//         .then(r => {
//             t.assert(r, "request was created");
//             req = r;
//         })
//     // Immediately finish & send the request
//         .then(() => req.finishAndSend())
//         .then(returned => {
//             t.assert(returned, "request was finished");
//             t.equals(returned.id, req.id, "request id matches what was returned by finish()");
//         })
//     // Teardown and end test
//         .then(() => TestUtil.shutdownScout(t, scout))
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });
// // https://github.com/scoutapp/scout_apm_node/issues/70
// test("Multiple ongoing requests are possible at the same time", t => {
//     const scout = TestUtil.buildTestScoutInstance();
//     let first: ScoutRequest;
//     let second: ScoutRequest;
//     scout
//         .setup()
//     // Create the first & second request
//         .then(() => Promise.all([
//             scout.startRequest(),
//             scout.startRequest(),
//         ]))
//         .then((reqs: ScoutRequest[]) => {
//             [first, second] = reqs;
//             t.assert(first, "first request was created");
//             t.assert(second, "second request was created");
//         })
//     // Immediately finish & send the second request
//         .then(() => second.finishAndSend())
//         .then(returned => {
//             t.assert(returned, "second request was finished");
//             t.equals(returned.id, second.id, "second request id matches what was returned by finish()");
//         })
//     // Wait then finish the second request
//         .then(() => TestUtil.waitMs(100))
//     // Finish & send the first request
//         .then(() => first.finishAndSend())
//         .then(returned => {
//             t.assert(returned, "first request was finished");
//             t.equals(returned.id, first.id, "first request id matches what was returned by finish()");
//         })
//     // Teardown and end test
//         .then(() => TestUtil.shutdownScout(t, scout))
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });
// // https://github.com/scoutapp/scout_apm_node/issues/72
// test("Ensure that no requests are received by the agent if monitoring is off", t => {
//     const scout = new Scout(buildScoutConfiguration({
//         allowShutdown: true,
//         monitor: false,
//     }));
//     let req: ScoutRequest;
//     let span: ScoutSpan;
//     // Fail the test if a request is sent from the agent
//     scout.on(ScoutAgentEvent.RequestSent, (req) => {
//         t.fail("agent sent a request");
//     });
//     scout
//         .setup()
//     // Create the first & second request
//         .then(() => scout.startRequest())
//         .then(r => req = r)
//     // Add a span
//         .then(() => req.startChildSpan("Controller/test"))
//         .then(s => span = s)
//     // Wait a little then finish the request (finishing the span as well)
//         .then(() => req.finishAndSend())
//         .then(returned => t.assert(returned, "req request was finished"))
//     // Teardown and end test
//         .then(() => TestUtil.shutdownScout(t, scout))
//         .catch(err => TestUtil.shutdownScout(t, scout, err));
// });
