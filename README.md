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

Install the `scout-apm-client`:

```shell
$ npm install scout-apm-client
```

## Using `scout-apm-client` with [`express`](https://expressjs.com/)

Scout supports use with `express`-based applications by using app-wide middleware:

```javascript
const express = require("express");
const app = express();
const scout = require("scout-apm-client").expressMiddleware;

// Enable the app-wide scout middleware
app.use(scout());

// Set up the routes for your application
app.get('/', function (req, res) {
  res.send('hello, world!')
})
```

For more information on configuration, see `docs/configuration.md`

## Using `scout-apm-client` with other frameworks ##

Scout supports use with any other frameworks through it's `Promise` based API:

```javascript
const Scout = require("scout-apm-client").Scout;
const scout = new Scout();

// Set up your scout instance
scout.setup()
    .then(scout => {
        // Start a request trace with Scout
        scout.startRequest()
            .then(scoutRequest => {
                // Run your code
                bigHeavyTaskThatReturnsAPromise()
                    .then(() => scoutRequest.finish());
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
3. Write code for your change/bugfix/feature
4. Run `make test` to ensure all tests are passing (see `docs/tests.md` for more information)
5. Submit a PR

## Documentation

For full installation and troubleshooting documentation, visit our [help site](http://help.apm.scoutapp.com/#nodejs-client).

## Support

Please contact us at [support@scoutapp.com](mailto://support@scoutapp.com) or [create an issue](https://github.com/scoutapp/scout_apm_node/issues/new) in this repository.
