# Configuration #

There are several levels of configuration for the Scout client:

- ENV variables
- In-application configuration
- Scout Defaults

For information on configuration file syntax and ENV variables, see [Scout help documentation](https://docs.scoutapm.com/).

## In-Application (Scout Client) Configuration ##

In addition to checking/using configuration from the default areas, the `Scout` client instance allows for code-level configuration encapsulated by the following interface:

```typescript
interface ScoutConfiguration {
    // Application finger printing / auth
    name: string;
    key: string;
    revisionSHA: string;
    appServer: string;
    applicationRoot: string;
    scmSubdirectory: string;

    // Operation
    logLevel: LogLevel;
    logFilePath: "stdout" | string;
    socketPath: string;
    httpProxy: string;
    monitor: boolean;

    // Framework
    framework: string;
    frameworkVersion: string;

    // Agent
    apiVersion: string;
    downloadUrl: string;

    coreAgentDownload: boolean;
    coreAgentLaunch: boolean;
    coreAgentDir: string;
    coreAgentLogLevel: LogLevel;
    coreAgentPermissions: number;
    coreAgentVersion: string;

    // Machine information
    hostname: string | null;

    // Trace controls
    ignore: string[]; // ignored route prefixes
    collectRemoteIP: boolean;
    uriReporting: URIReportingLevel;

    // Misc
    disabledInstruments: string[];
}
```
| Value                  | Type                | Default                                                                              | Description                                                                                                                                      |
|------------------------|---------------------|--------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| `name`                 | `string`            | ""                                                                                   | The name of your application                                                                                                                     |
| `key`                  | `string`            | ""                                                                                   | Your Scout key (you can find this [on your Scout APM dashboard](https://apm.scoutapp.com/home))                                                  |
| `revisionSHA`          | `string`            | ""                                                                                   | The SHA hash of the revision of the source code you are deploying                                                                                |
| `appServer`            | `string`            | ""                                                                                   | Application server                                                                                                                               |
| `applicationRoot`      | `string`            | ""                                                                                   | Root of the application                                                                                                                          |
| `scmSubdirectory`      | `string`            | ""                                                                                   | SCM subdirectory                                                                                                                                 |
| `logLevel`             | `LogLevel`          | `"info"`                                                                             | The logging level to be used by the Scout instance                                                                                               |
| `logFilePath`          | `string`            | `"stdout"`                                                                           | The log file to be used by the underlying scout core-agent                                                                                       |
| `socketPath`           | `string`            | `"/tmp/scout_apm_core"`                                                              | The path to the socket used by the `core-agent`                                                                                                  |
| `httpProxy`            | `string`            | N/A                                                                                  | A HTTP proxy to use when communicating with the scout core-agent                                                                                 |
| `monitor`              | `boolean`           | `false`                                                                              | Whether to enable/disable monitoring                                                                                                             |
| `framework`            | `string`            | `""`                                                                                 | Framework name                                                                                                                                   |
| `frameworkVersion`     | `string`            | `""`                                                                                 | Framework version                                                                                                                                |
| `apiVersion`           | `string`            | `"1.0"`                                                                              | A string representing the intended API version of the core agent                                                                                 |
| `downloadUrl`          | `string`            | `"https://s3-us-west-1.amazonaws.com/scout-public-downloads/apm_core_agent/release"` | Download URL                                                                                                                                     |
| `coreAgentDownload`    | `boolean`           | `true`                                                                               | Whether to allow downloading of the `core-agent` binary                                                                                          |
| `coreAgentLaunch`      | `boolean`           | `true`                                                                               | Whether to allow launching of the `core-agent` binary                                                                                            |
| `coreAgentDir`         | `string`            | `"/tmp/scout_apm_core"`                                                              | The directory to use for the `core-agent` binary                                                                                                 |
| `coreAgentLogLevel`    | `LogLevel`          | `"info"`                                                                             | The logging level to be used by the `core-agent` (assumign it is launched)                                                                       |
| `coreAgentPermissions` | `string[]`          | `[]`                                                                                 | Permissions to be issued to the core agent                                                                                                       |
| `coreAgentVersion`     | `string`            | `"1.1.8"`                                                                            | A string representing the version of the Scout agent that should be used                                                                         |
| `hostname`             | `string`            | `hostname()`                                                                         | The hostname of the machine (retrieved from [NodeJS's `os.hostname()`](https://nodejs.org/api/os.html#os_os_hostname) if not provided explicitly |
| `ignore`               | `string[]`          | `[]`                                                                                 | Route prefixes that should be ignored (case insensitive)                                                                                         |
| `collectRemoteIP`      | `boolean`           | `true`                                                                               | Whether to collect remote IP addresses of incoming requests (where possible)                                                                     |
| `uriReportingLevel`    | `URIReportingLevel` | `"filtered-params"`                                                                  | URI reporting level                                                                                                                              |
| `disabledInstruments`  | `string[]`          | `[]`                                                                                 | Disabled instruments                                                                                                                             |

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
    Path = "path",
}
```

## `ScoutOptions` ##

A `ScoutOptions` object can also be provided to either `scout.install` or `buildScoutConfiguration` with the following interface:

```typscript
interface ScoutOptions {
    logFn?: LogFn;
    downloadOptions?: Partial<AgentDownloadOptions>;
    appMeta?: ApplicationMetadata;
    slowRequestThresholdMs?: number;
}
```

| Value                    | Type                            | Description                                                                                                                     |
|                          |                                 |                                                                                                                                 |
|--------------------------|---------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| `logFn`                  | `LogFn`                         | A function that takes a log and level and writes a log message (ex. `scout.consoleLogFn` or `scout.buildWinstonLogFn(winston)`) |
| `downloadOptions`        | `Partial<AgentDownloadOptions>` | Options that can be set to control how the `core-agent` is downloaded                                                           |
| `appMeta`                | `ApplicationMetadata`           | Custom application metadata                                                                                                     |
| `slowRequestThresholdMs` | `number`                        | The threshold at which a request should be considered slow (in milliseconds)                                                    |

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
