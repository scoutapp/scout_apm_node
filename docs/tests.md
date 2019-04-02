# Testing #

`scout-client` comes with a full suite of tests, to run all of them run:

```shell
$ make test
```

## Unit tests ##

To run only the unit tests, run:

```shell
$ make test-unit
```

## Integration tests ##

To run only the integration tests, run:

```shell
$ make test-int
```

## End to End Tests ##

To run only the end to end (E2E) tests, run:

```shell
$ TEST_AGENT_KEY=<key> make test-e2e
```

`TEST_AGENT_KEY` are required for E2E tests that perform real commands against the Scout API with the local `scout-agent`. A more sustainable way of setting these environment variables is to make use of [`direnv`](https://direnv.net/), setting a `.envrc` in your project root.

## Testing out the `Agent` directly ##

To probe/send messages to a running agent, you can use the `node`/`ts console. Assuming the project has been built, the following script can be used:

```nodejs
$ node
> const ExternalProcessAgent = require("./dist/lib/agents/external-process.js").default;
> const agent = new ExternalProcessAgent({binPath: "", uri: "file:///path/to/core-agent.sock"});
> agent.connect().then(console.log)
# promise output, then you should see the status {connected: true}
```

To send an actual request to the core agent (for example a `V1GetVersionRequest`):

```nodejs
> const R = require("./dist/lib/protocol/v1/requests")
> agent.send(new R.V1GetVersionRequest()).then(console.log)
< V1GetVersionResponse {
<   type: 'v1-get-version-response',
<   version: CoreAgentVersion { raw: '1.1.8' },
<   result: 'Success' }
```

To send a registration request for an application:

```nodejs
> let req = new R.V1Register("your-manual-app-name", "<your scout key>", "1.0");
> agent.send(req).then(console.log);
< V1RegisterResponse { type: 'v1-register-response', result: 'Success' }
```

After registering, you may send whichever requests you'd like to, but note that `core-agent` buffers requests, so you may need to wait ~2 minutes to see requests/spans on [the scout dashboard](https://apm.scoutapp.com/home). In tests, you can use `TestUtil.waitForAgentBufferFlush` to perform this wait.
