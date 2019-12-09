import * as test from "tape";

import { Scout, buildScoutConfiguration, ScoutRequest, ScoutSpan } from "../lib";
import * as TestUtil from "./util";

test("Scout object creation works without config", t => {
    const scout = new Scout();
    t.assert(scout, "scout object was created");
    t.end();
});

test("Scout object setup works without config", t => {
    const scout = new Scout(buildScoutConfiguration({allowShutdown: true}));

    scout
        .setup()
        .then(scout => t.assert(scout, "scout object was successfully set up"))
    // Teardown and end test
        .then(() => scout.shutdown())
        .then(() => t.end())
        .catch(t.end);
});

test("Request can be created and finished", t => {
    const scout = new Scout(buildScoutConfiguration({allowShutdown: true}));
    let req: ScoutRequest;

    scout
        .setup()
    // Create the request
        .then(() => scout.startRequest())
        .then(r => {
            t.assert(r, "request was created");
            req = r;
        })
    // Immediately finish the request
        .then(() => req.finish())
        .then(returned => {
            t.assert(returned, "request was finished");
            t.equals(returned.id, req.id, "request id matches what was returned by finish()");
        })
    // Teardown and end test
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("Single span request", t => {
    const scout = new Scout(buildScoutConfiguration({allowShutdown: true}));
    let req: ScoutRequest;
    let span: ScoutSpan;

    scout
        .setup()
    // Create the request
        .then(() => scout.startRequest())
        .then(r => req = r)
    // Add a span to the request
        .then(() => req.startChildSpan("Controller/test"))
        .then(s => {
            t.assert(s, "span was created");
            t.equals(s.request.id, req.id, "created span's request matches");
            span = s;
        })
    // Finish the span
        .then(() => span.stop()) // span.finish() would work too
        .then(returnedSpan => {
            t.assert(returnedSpan, "span was finished");
            t.equals(returnedSpan.id, span.id, "span id matches what was returned by finish()");
        })
    // Finish the request
        .then(() => req.finish())
    // Teardown and end test
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("Multi span request (2 top level)", t => {
    const scout = new Scout(buildScoutConfiguration({allowShutdown: true}));

    const spans: ScoutSpan[] = [];
    let req: ScoutRequest;

    scout
        .setup()
    // Create the request
        .then(() => scout.startRequest())
        .then(r => req = r)
    // Add the first span
        .then(() => req.startChildSpan("Controller/test.first"))
        .then(s => spans.push(s))
        .then(() => TestUtil.waitMs(100))
    // Add the second span
        .then(() => req.startChildSpan("Controller/test.second"))
        .then(s => spans.push(s))
    // Finish the spans
        .then(() => Promise.all(spans.map(s => s.stop())))
    // Ensure the spans are marked as stopped
        .then(returnedSpan => {
            t.assert(spans.every(s => s.isStopped()), "spans are stopped");
            t.assert(!req.isStopped(), "request is not stopped yet");
        })
    // Finish the request
        .then(() => req.finish())
        .then(() => t.assert(req.isStopped(), "request is stopped"))
    // Teardown and end test
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("Multi span request (1 top level, 1 nested)", t => {
    const scout = new Scout(buildScoutConfiguration({allowShutdown: true}));

    let req: ScoutRequest;
    let parent: ScoutSpan;
    let child: ScoutSpan;

    scout
        .setup()
    // Create the request
        .then(() => scout.startRequest())
        .then(r => req = r)
    // Add the first span
        .then(() => req.startChildSpan("Controller/test.first"))
        .then(s => parent = s)
        .then(() => TestUtil.waitMs(100))
    // Add the second (nested) span
        .then(() => parent.startChildSpan("Controller/test.first.nested"))
        .then(s => child = s)
    // Finish the child span (but not the parent)
        .then(() => child.finish())
    // Ensure the child span is stopped but the parent isn't
        .then(returnedSpan => {
            t.equals(returnedSpan.id, child.id, "returned span id is the child");
            t.assert(child.isStopped(), "child span is stopped");
            t.assert(!parent.isStopped(), "parent span is not stopped yet");
            t.assert(!req.isStopped(), "request is not stopped yet");
        })
    // Finish the parent span
        .then(() => parent.finish())
        .then(returnedSpan => {
            t.assert(parent.isStopped(), "parent span is not stopped yet");
            t.assert(!req.isStopped(), "request is not stopped yet");
        })
    // Finish the request
        .then(() => req.finish())
        .then(() => t.assert(req.isStopped(), "request is stopped"))
    // Teardown and end test
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("Parent Span auto close works (1 top level, 1 nested)", t => {
    const scout = new Scout(buildScoutConfiguration({allowShutdown: true}));

    let req: ScoutRequest;
    let parent: ScoutSpan;
    let child: ScoutSpan;

    scout
        .setup()
    // Create the request
        .then(() => scout.startRequest())
        .then(r => req = r)
    // Add the first span
        .then(() => req.startChildSpan("Controller/test.first"))
        .then(s => parent = s)
        .then(() => TestUtil.waitMs(100))
    // Add the second (nested) span
        .then(() => parent.startChildSpan("Controller/test.first.nested"))
        .then(s => child = s)
    // Finish the parent span (this should trigger the child span being finished as well)
        .then(() => parent.finish())
    // Ensure the child span is stopped but the parent isn't
        .then(returnedSpan => {
            t.equals(returnedSpan.id, parent.id, "returned span id is the parent");
            t.assert(child.isStopped(), "child span is stopped");
            t.assert(parent.isStopped(), "parent span is stopped");
            t.assert(!req.isStopped(), "request is not stopped yet");
        })
    // Finish the request
        .then(() => req.finish())
        .then(() => t.assert(req.isStopped(), "request is stopped"))
    // Teardown and end test
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("Request auto close works (1 top level, 1 nested)", t => {
    const scout = new Scout(buildScoutConfiguration({allowShutdown: true}));

    let req: ScoutRequest;
    let parent: ScoutSpan;
    let child: ScoutSpan;

    scout
        .setup()
    // Create the request
        .then(() => scout.startRequest())
        .then(r => req = r)
    // Add the first span
        .then(() => req.startChildSpan("Controller/test.first"))
        .then(s => parent = s)
        .then(() => TestUtil.waitMs(100))
    // Add the second (nested) span
        .then(() => parent.startChildSpan("Controller/test.first.nested"))
        .then(s => child = s)
    // Finish the request (should trigger all spans below to finish)
        .then(() => req.finish())
    // Ensure the child span is stopped but the parent isn't
        .then(returnedReq => {
            t.equals(returnedReq.id, req.id, "returned request id matches");
            t.assert(child.isStopped(), "child span is stopped");
            t.assert(parent.isStopped(), "parent span is stopped");
            t.assert(req.isStopped(), "request is stopped");
        })
    // Teardown and end test
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("Request auto close works (2 top level)", t => {
    const scout = new Scout(buildScoutConfiguration({allowShutdown: true}));

    let req: ScoutRequest;
    const spans: ScoutSpan[] = [];

    scout
        .setup()
    // Create the request
        .then(() => scout.startRequest())
        .then(r => req = r)
    // Add the first span
        .then(() => req.startChildSpan("Controller/test.first"))
        .then(s => spans.push(s))
        .then(() => TestUtil.waitMs(100))
    // Add the second span
        .then(() => req.startChildSpan("Controller/test.second"))
        .then(s => spans.push(s))
    // Finish the request (triggering spans being finished)
        .then(() => req.stop())
    // Ensure the child span is stopped but the parent isn't
        .then(returnedReq => {
            t.assert(spans.every(s => s.isStopped()), "all spans are stopped");
            t.equals(spans.length, 2, "2 spans were created");
            t.assert(req.isStopped(), "request is stopped");
        })
    // Teardown and end test
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// // https://github.com/scoutapp/scout_apm_node/issues/59
// test("Download disabling works via top level config", t => {
//     const scout = new Scout(buildScoutConfiguration({allowShutdown: true}));

//     t.fail("TODO");

//     scout
//         .setup()
//         .then(() => t.end())
//         .catch(t.end);
// });

// // https://github.com/scoutapp/scout_apm_node/issues/59
// test("Launch disabling works via top level config", t => {
//     const scout = new Scout(buildScoutConfiguration({allowShutdown: true}));

//     t.fail("TODO");

//     scout
//         .setup()
//         .then(() => t.end())
//         .catch(t.end);
// });

// // https://github.com/scoutapp/scout_apm_node/issues/59
// test("Custom version specification works via top level config", t => {
//     const scout = new Scout(buildScoutConfiguration({allowShutdown: true}));

//     t.fail("TODO");

//     scout
//         .setup()
//         .then(() => t.end())
//         .catch(t.end);
// });
