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

Install `@scout_apm/scout-apm`:

```shell
$ npm install @scout_apm/scout-apm
```

## Using `@scout_apm/scout-apm` with [`express`](https://expressjs.com/)

Scout supports use with `express`-based applications by using app-wide middleware:

```javascript
const scout = require("@scout_apm/scout-apm");
const process = require("process");
const express = require("express");

// Set up scout (this returns a Promise you may wait on if desired)
scout.install(
  {
    allowShutdown: true, // allow shutting down spawned scout-agent processes from this program
    monitor: true, // enable monitoring
    name: "<application name>",
    key: "<scout key>",
  },
);


// Initialize the express application
const app = express();

// Enable the app-wide scout middleware
app.use(scout.expressMiddleware());

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

If your `core-agent` instance is running externally and you do not need `@scout_apm/scout-apm` to start it, you can set the `coreAgentLaunch` setting to `false` or specify the ENV variable `SCOUT_CORE_AGENT_LAUNCH` with value `false`.

For more information on configuration, see `docs/configuration.md`

## Using `@scout_apm/scout-apm` with other frameworks ##

Scout supports use with any other frameworks through it's `Promise` based API:

```javascript
const scout = require("@scout_apm/scout-apm");

// Set up scout (this returns a Promise you may wait on if desired)
scout.install(
  {
    allowShutdown: true, // allow shutting down spawned scout-agent processes from this program
    monitor: true, // enable monitoring
    name: "<application name>",
    key: "<scout key>",
  },
);

// Run a WebTransaction
scout.api.WebTransaction.run("GET /users", (finishTransaction) => { .
   return yourHandler
     .run()
     .then(() => finishTransaction());
});

// Run a BackgroundTransaction
scout.api.BackgroundTransaction.run("your-large-transaction", (finishTransaction) => {
  return bigHeavyTaskThatReturnsAPromise()
      .then(() => finishTransaction());
});
```

For more examples, see `docs/cookbook.md`
For more information on the architecture of the client see `docs/architecture.md`.

## Development

To get started developing `@scout_apm/scout-apm`, run:

```shell
$ make dev-setup
```

This will set up the necessary environment (including git hooks) to get started hacking on `@scout_apm/scout-apm`.

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
