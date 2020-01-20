import * as test from "tape";
import * as TestUtil from "./util";
import * as Constants from "../lib/constants";
import * as request from "supertest";

import { Application } from "express";
import { scoutMiddleware, ApplicationWithScout } from "../lib/express";
import {
    AgentEvent,
    AgentRequestType,
    BaseAgentRequest,
    ScoutContextNames,
    ScoutSpanOperation,
    ScoutEvent,
    URIReportingLevel,
    buildScoutConfiguration,
} from "../lib/types";
import { Scout, ScoutEventRequestSentData } from "../lib/scout";
import { setupRequireIntegrations } from "../lib";
import { V1StartSpan } from "../lib/protocol/v1/requests";
import { FILE_PATHS } from "./fixtures";

// Set up the pug integration
setupRequireIntegrations(["pug"]);
const pug = require("pug");

test("Simple operation", t => {
    // Create an application and setup scout middleware
    const app: Application & ApplicationWithScout = TestUtil.simpleExpressApp(scoutMiddleware({
        config: buildScoutConfiguration({
            allowShutdown: true,
            monitor: true,
        }),
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }));

    let scout: Scout;

    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/")
        .expect("Content-Type", /json/)
        .expect(200)
        .then(res => {
            if (!app.scout) { throw new Error("Scout was not added to app object"); }

            t.assert(app.scout, "scout instance was added to the app object");
            t.assert(app.scout.hasAgent(), "the scout instance has an agent");
            scout = app.scout;
        })
    // Set up listeners and make another request to ensure that scout is working
        .then(() => {
            // Create a listener to watch for the request finished event
            const listener = () => {
                t.pass("received RequestFinished agent event");

                // Remove listener
                scout.removeListener(AgentEvent.RequestFinished, listener);

                // Wait a little while for request to finish up, then shutdown
                TestUtil.shutdownScout(t, scout)
                    .catch(err => TestUtil.shutdownScout(t, scout, err));
            };

            // Set up listener on the agent
            scout.on(AgentEvent.RequestFinished, listener);

            // Make another request to the application
            request(app)
                .get("/")
                .expect("Content-Type", /json/)
                .expect(200)
                .then(() => t.comment("sent second request"));
        })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("Dynamic segment routes", {timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS}, t => {
    // Create an application and setup scout middleware
    const app: Application & ApplicationWithScout = TestUtil.simpleDynamicSegmentExpressApp(
        scoutMiddleware({
            config: buildScoutConfiguration({
                allowShutdown: true,
                monitor: true,
            }),
            requestTimeoutMs: 0, // disable request timeout to stop test from hanging
        }),
    );

    let scout: Scout;
    const expectedRootSpan = "Controller/GET /dynamic/:segment";

    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/")
        .expect("Content-Type", /json/)
        .expect(200)
        .then(res => {
            if (!app.scout) { throw new Error("Scout was not added to app object"); }

            t.assert(app.scout, "scout instance was added to the app object");
            t.assert(app.scout.hasAgent(), "the scout instance has an agent");
            scout = app.scout;
        })
    // Set up listeners and make another request to ensure that scout is working
        .then(() => {
            // Create a listener to watch for the request finished event
            const listener = (message: BaseAgentRequest) => {
                // Ignore requests that are sent that aren't span starts
                if (!message || message.type !== AgentRequestType.V1StartSpan) { return; }

                // Skip requests that aren't the span we expect ( the initial GET / will trigger this)
                const msg: V1StartSpan = message as V1StartSpan;
                if (msg.operation !== expectedRootSpan) { return; }

                // Ensure that the span is what we expect
                t.equals(
                    msg.operation,
                    expectedRootSpan,
                    `root span operation is correct [${msg.operation}]`,
                );

                // Remove agent, pass test
                scout.removeListener(AgentEvent.RequestSent, listener);

                // Wait a little while for request to finish up, then shutdown
                TestUtil.shutdownScout(t, scout)
                    .catch(err => TestUtil.shutdownScout(t, scout, err));
            };

            // Set up listener on the agent
            scout.on(AgentEvent.RequestSent, listener);

            // Make another request to the application
            request(app)
                .get("/dynamic/1234")
                .expect("Content-Type", /json/)
                .expect(200)
                .then(() => t.comment("sent second request"));
        })
        .catch(t.end);
});

test("Application which errors", {timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS}, t => {
    // Create an application and setup scout middleware
    const app: Application & ApplicationWithScout = TestUtil.simpleErrorApp(scoutMiddleware({
        config: buildScoutConfiguration({
            allowShutdown: true,
            monitor: true,
        }),
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }));

    let scout: Scout;

    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/")
        .expect(500)
        .then(res => {
            if (!app.scout) { throw new Error("Scout was not added to app object"); }

            t.assert(app.scout, "scout instance was added to the app object");
            t.assert(app.scout.hasAgent(), "the scout instance has an agent");
            scout = app.scout;
        })
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("express ignores a path (exact path, with dynamic segments)", {timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS}, t => {
    const path = "/dynamic/:segment";
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        ignore: [path],
    }));
    // Create an application and setup scout middleware
    const app: Application & ApplicationWithScout = TestUtil.simpleDynamicSegmentExpressApp(scoutMiddleware({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }));

    // Set up a listener that should *not* fire
    const listener = (ignoredPath: string) => {
        t.equals(path, ignoredPath, `IgnoredPathDetected event was emitted with the expected path [${path}]`);

        scout.removeListener(ScoutEvent.IgnoredPathDetected, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.IgnoredPathDetected, listener);

    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/dynamic/1234")
        .expect("Content-Type", /json/)
        .expect(200)
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("express ignores a path (exact path, static)", {timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS}, t => {
    const path = "/";
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        ignore: [path],
    }));
    // Create an application and setup scout middleware
    const app: Application & ApplicationWithScout = TestUtil.simpleDynamicSegmentExpressApp(scoutMiddleware({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }));

    // Set up a listener that should *not* fire
    const listener = (ignoredPath: string) => {
        t.equals(path, ignoredPath, `IgnoredPathDetected event was emitted with the expected path [${path}]`);

        scout.removeListener(ScoutEvent.IgnoredPathDetected, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.IgnoredPathDetected, listener);

    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/")
        .expect("Content-Type", /json/)
        .expect(200)
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("express ignores a path (prefix, with dynamic segments)", {timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS}, t => {
    const path = "/dynamic/:segment";
    const prefix = "/dynamic";
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        ignore: [prefix],
    }));
    // Create an application and setup scout middleware
    const app: Application & ApplicationWithScout = TestUtil.simpleDynamicSegmentExpressApp(scoutMiddleware({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }));

    // Set up a listener that should *not* fire
    const listener = (ignoredPath: string) => {
        // The trace was ignored due to a prefix match so
        t.equals(path, ignoredPath, `IgnoredPathDetected event was emitted with the expected path [${path}]`);

        scout.removeListener(ScoutEvent.IgnoredPathDetected, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.IgnoredPathDetected, listener);

    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/dynamic/1234")
        .expect("Content-Type", /json/)
        .expect(200)
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("express ignores a path (prefix, static)", {timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS}, t => {
    const path = "/echo-by-post";
    const prefix = "/echo";
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        ignore: [prefix],
    }));
    // Create an application and setup scout middleware
    const app: Application & ApplicationWithScout = TestUtil.simpleDynamicSegmentExpressApp(scoutMiddleware({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }));

    // Set up a listener that should *not* fire
    const listener = (ignoredPath: string) => {
        // The trace was ignored due to a prefix match so
        t.equals(path, ignoredPath, `IgnoredPathDetected event was emitted with the expected path [${path}]`);

        scout.removeListener(ScoutEvent.IgnoredPathDetected, listener);

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.IgnoredPathDetected, listener);

    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .post(path)
        .send("hello")
        .expect("Content-Type", /json/)
        .expect(200)
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("URI params are filtered", {timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS}, t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Create an application and setup scout middleware
    const app: Application & ApplicationWithScout = TestUtil.simpleDynamicSegmentExpressApp(scoutMiddleware({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }));

    // Set up a listener that should *not* fire
    const listener = (data: ScoutEventRequestSentData) => {
        const pathTag = data.request.getTags().find(t => t.name === Constants.SCOUT_PATH_TAG);

        // Remove listener since this should fire once
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Ensure path tag was specified
        if (!pathTag) {
            TestUtil.shutdownScout(t, scout, new Error(`Context with name [${Constants.SCOUT_PATH_TAG}] missing`));
            return;
        }

        // Check that the tag has the right value
        t.assert(pathTag, "Context with the path was present on the request");
        t.equals(
            pathTag.value,
            `/echo-by-post?password=${Constants.DEFAULT_PARAM_SCRUB_REPLACEMENT}`,
            `The path tag value is correct [${pathTag.value}]`,
        );

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .post("/echo-by-post?password=test")
        .send("hello")
        .expect("Content-Type", /json/)
        .expect(200)
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

test("URI filtered down to path", {timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS}, t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        uriReporting: URIReportingLevel.Path,
    }));
    // Create an application and setup scout middleware
    const app: Application & ApplicationWithScout = TestUtil.simpleDynamicSegmentExpressApp(scoutMiddleware({
        scout,
        requestTimeoutMs: 0, // disable request timeout to stop test from hanging
    }));

    // Set up a listener that should *not* fire
    const listener = (data: ScoutEventRequestSentData, another) => {
        const pathTag = data.request.getTags().find(t => t.name === Constants.SCOUT_PATH_TAG);

        // Remove listener since this should fire once
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Ensure path tag was specified
        if (!pathTag) {
            TestUtil.shutdownScout(t, scout, new Error(`Context with name [${Constants.SCOUT_PATH_TAG}] missing`));
            return;
        }

        // Check that the tag has the right value
        t.assert(pathTag, "Context with the path was present on the request");
        t.equals(
            pathTag.value,
            "/echo-by-post",
            `The path tag value is correct [${pathTag.value}]`,
        );

        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .post("/echo-by-post?password=test")
        .send("hello")
        .expect("Content-Type", /json/)
        .expect(200)
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/82
test("Pug integration works", {timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS}, t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    // Create an application that's set up to use pug templating
    const app: Application & ApplicationWithScout = TestUtil.simpleHTML5BoilerplateApp(scoutMiddleware({scout}), "pug");

    // Set up a listener that should fire when the request is finished
    const listener = (data: ScoutEventRequestSentData, another) => {
        const pathTag = data.request.getTags().find(t => t.name === Constants.SCOUT_PATH_TAG);

        // Remove listener since this should fire once
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // Look up the template render span from the request
        data.request
            .getChildSpans()
            .then(spans => {
                const renderSpan = spans.find(s => s.operation === ScoutSpanOperation.TemplateRender);
                t.assert(renderSpan, "template render span was present on request");
                if (!renderSpan) {
                    t.fail("no render span present on request");
                    throw new Error("No render span");
                }

                t.equals(
                    renderSpan.getContextValue(ScoutContextNames.Name),
                    FILE_PATHS.PUG_HTML5_BOILERPLATE,
                    "name tag is correct",
                );
            })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    scout.on(ScoutEvent.RequestSent, listener);

    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/")
        .expect("Content-Type", /html/)
        .expect(200)
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
