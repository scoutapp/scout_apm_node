import * as test from "tape";

import { Scout, ScoutConfiguration, ScoutRequest } from "../lib";
import * as TestUtil from "./util";

test("Scout object creation works without config", t => {
    const scout = new Scout();
    t.assert(scout, "scout object was created");
    t.end();
});

test("Scout object setup works without config", t => {
    const scout = new Scout(new ScoutConfiguration({allowShutdown: true}));

    scout
        .setup()
        .then(scout => t.assert(scout, "scout object was successfully set up"))
    // Teardown and end test
        .then(() => scout.shutdown())
        .then(() => t.end())
        .catch(t.end);
});

test("Request can be created and finished", t => {
    const scout = new Scout(new ScoutConfiguration({allowShutdown: true}));
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
