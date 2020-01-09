# Scout APM NodeJS Client #

Monitor the performance of NodeJS apps, with [Scout](https://www.scoutapp.com). Detailed performance metrics and transactional traces are collected once the `scout-apm` package is installed and configured.

## Requirements

[NodeJS](https://nodejs.org) Versions:
- 10+

Scout APM works with the following frameworks:
- [Express](https://expressjs.com) 4.x

## Quick Start

__A Scout account is required. [Signup for Scout](https://apm.scoutapp.com/users/sign_up).__

## Installing the Scout client

Install `scout-apm-client`:

```shell
$ npm install scout-apm-client
```

## Using `scout-apm-client` with [`express`](https://expressjs.com/)

Scout supports use with `express`-based applications by using app-wide middleware:

```javascript
const process = require("process");
const express = require("express");
const scout = require("scout-apm-client");

// Initialize the express application
const app = express();

// Enable the app-wide scout middleware
app.use(scout.expressMiddleware({
  config: {
    allowShutdown: true, // allow shutting down spawned scout-agent processes from this program
    monitor: true, // enable monitoring
    name: "<application name>",
    key: "<scout key>",
  },
}));

// Set up the routes for the application
app.get('/', function (req, res) {
  res.send('hello, world!');
});

// Shut down the core-agent when this program exits
process.on('exit', () => {
  if (app && app.scout) {
    app.scout.shutdown();
  }
});

// Start application
app.listen(3000);
```

In addition to specifying `app` and `name` in the `config` object when building the middleware, you may also specify it via ENV by setting `SCOUT_NAME` and `SCOUT_APP` as environment variables for the process.

If your `core-agent` instance is running externally and you do not need `scout-apm-client` to start it, you can set the `coreAgentLaunch` setting to `false` or specify the ENV variable `SCOUT_CORE_AGENT_LAUNCH` with value `false`.

For more information on configuration, see `docs/configuration.md`

## Using `scout-apm-client` with other frameworks ##

Scout supports use with any other frameworks through it's `Promise` based API:

```javascript
const Scout = require("scout-apm-client").Scout;

// Generate configuration for scout with some overrides
const scoutConfiguration = buildScoutConfiguration({
    monitor: true, // monitoring is *off* by default
    name: "<application name>",
    key: "<scout key>",
});

// Create a scout instance
const scout = new Scout(config);

// Set up the scout instance
scout.setup()
    .then(scout => {
        // Start a request trace with Scout
        return scout.startRequest()
            .then(scoutRequest => {
                // Run the procedure to be monitored
                return bigHeavyTaskThatReturnsAPromise()
                    .then(() => scoutRequest.finishAndSend());
            });
    });
});
```

For more examples, see `docs/cookbook.md`
For more information on the architecture of the client see `docs/architecture.md`.

## Development

To get started developing `scout-apm-client`, run:

```shell
$ make dev-setup
```

This will set up the necessary environment (including git hooks) to get started hacking on `scout-apm-client`.

This repository comes with a few development aids pre-installed, via `make` targets:

```
$ make lint # run tslint (a typescript linter
$ make lint-watch # run tslint continuously

$ make build # run tsc (the typescript compiler)
$ make build-watch # run tsc continuously
```

For more information on the development environment and tools, see `docs/development.md`.

## Contributing

To contribute to development of the NodeJS client:

0. Clone this repository
1. Run `make dev-setup` to set up the local development environment
2. Run `make build` to build the project
3. Write code for the change/bugfix/feature
4. Run `make test` to ensure all tests are passing (see `docs/tests.md` for more information)
5. Submit a PR

## Documentation

For full installation and troubleshooting documentation, visit our [help site](http://help.apm.scoutapp.com/#nodejs-client).

## Support

Please contact us at [support@scoutapp.com](mailto://support@scoutapp.com) or [create an issue](https://github.com/scoutapp/scout_apm_node/issues/new) in this repository.
