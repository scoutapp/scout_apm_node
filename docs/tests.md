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
