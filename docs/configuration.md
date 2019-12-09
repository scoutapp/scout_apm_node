# Configuration #

There are several levels of configuration for the Scout client:

- ENV variables
- In-application configuration
- Scout Defaults

For information on configuration file syntax and ENV variables, see [Scout help documentation](https://docs.scoutapm.com/).

## In-Application (Scout Client) Configuration ##

In addition to checking/using configuration from the default areas, the `Scout` client instance allows for code-level configuration encapsulated by the following interface:

```typescript
class ScoutConfiguration {
    // Application finger printing / auth
    public readonly name: string = "";
    public readonly key: string = "";
    public readonly revisionSHA: string = "";

    // Operation
    public readonly logLevel: LogLevel = LogLevel.Info;
    public readonly logFilePath: "stdout" | string = "stdout";
    public readonly httpProxy?: string;
    public readonly allowShutdown: boolean = false;

    // Agent
    public readonly agentVersion: string = "1.1.8";
    public readonly apiVersion: string = "1.0";

    // Machine information
    public readonly hostname: string = hostname();

    // Trace controls
    public readonly ignoredRoutePrefixes: string[] = [];
    public readonly collectRemoteIP: boolean = true;
    public readonly uriReportingLevel: URIReportingLevel = URIReportingLevel.FilteredParams;
}
```
| Value                  | Type                | Default             | Description                                                                                                                                      |
|------------------------|---------------------|---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| `name`                 | `string`            | ""                  | The name of your application                                                                                                                     |
| `key`                  | `string`            | ""                  | Your Scout key (you can find this [on your Scout APM dashboard](https://apm.scoutapp.com/home))                                                  |
| `revisionSHA`          | `string`            | ""                  | The SHA hash of the revision of the source code you are deploying                                                                                |
| `logLevel`             | `LogLevel`          | `"info"`            | The logging level to be used by the Scout instance                                                                                               |
| `logFilePath`          | `string`            | `"stdout"`          | The log file to be used by the underlying scout core-agent                                                                                       |
| `httpProxy`            | `string`            | `undefined`         | A HTTP proxy to use when communicating with the scout core-agent                                                                                 |
| `agentVersion`         | `string`            | `"1.1.8"`           | A string representing the version of the Scout agent that should be used                                                                         |
| `apiVersion`           | `string`            | `"1.0"`             | A string representing the intended API version of the core agent                                                                                 |
| `hostname`             | `string`            | `hostname()`        | The hostname of the machine (retrieved from [NodeJS's `os.hostname()`](https://nodejs.org/api/os.html#os_os_hostname) if not provided explicitly |
| `ignoredRoutePrefixes` | `string[]`          | `[]`                | Route prefixes that should be ignored (case insensitive)                                                                                         |
| `collectRemoteIP`      | `boolean`           | `true`              | Whether to collect remote IP addresses of incoming requests (where possible)                                                                     |
| `uriReportingLevel`    | `URIReportingLevel` | `"filtered-params"` | URI reporting level                                                                                                                              |


`LogLevel`s are determined by the following (unordered) enumeration:

```typescript
enum LogLevel {
    Info = "info",
    Warn = "warn",
    Debug = "debug",
    Trace = "trace",
    Error = "error",
}
```

`URIReportingLevel`s are determined by the following enumeration:

```typescript
enum URIReportingLevel {
    FilteredParams = "filtered-params",
    PathOnly = "path-only",
}
```

## Override Behavior ##

If a value is specified at both ENV and the application level, then the *top most* level overrides the lower layers.

As an example, in a scenario where configuration is specified in the following manner:

- the ENV variable `SCOUT_NAME` set to the value `my-app-from-env`
- A `Partial<ScoutConfiguration>` with value `{name: "my-app-from-app"}` (i.e. `new Scout(buildScoutConfiguration({name: "my-app-from-app"}))`)
- (without any action on your part the default value for `name` is `""`)

The Scout agent will use a name of `"my-app-from-env"` -- the ENV value overrides the application-specified value, and the default.

## Integrations ##

Scout offers various integrations for often-used libraries and frameworks in the NodeJS ecosystem. Cursory configuration information regarding each is listed below (please consult integration-specific documentation for more details).

### Express ###

For more information on how the express integration works (and how to configure it), see `docs/integrations/express.md`
