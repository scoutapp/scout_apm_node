# ExpressJS Integration #

As [Express](https://expressjs.com) is a very popular web server library for NodeJS, Scout supports easy request tracing with minimal via an `app`-wide middleware.

## Using the Scout integration ##

<TODO: ADD NOTE>

## Customization ##

The ExpressJS integration offers a few extension points, which are encapsulated by the following interface and described below:

```typescript
interface ExpressMiddlewareOptions {
    config?: ScoutConfiguration;
    requestTimeoutMs?: number;
    logFn?: LogFn;
}
```

| Value              | Type                 | Default  | Description                                                                                                              |
|--------------------|----------------------|----------|--------------------------------------------------------------------------------------------------------------------------|
| `config`           | `ScoutConfiguration` | N/A      | The configuration to be passed when creating the `Scout` instance                                                        |
| `requestTimeoutMs` | `number`             | `300000` | The default timeout for any request trace (any traces on requests that take more than this amount of time are cut short) |
| `logFn`            | `LogFn`              | N/A      | A logging function (that takes `message` and `logLevel` arguments) to allow for logging of the scout layer               |

## How the integration works ##

<TODO: ADD NOTE>

`req` object modification

## What your traces will look like ##

<TODO: description of the default>

## How to add to your traces and tag your traces ##
