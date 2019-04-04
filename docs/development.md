# Development #

Documentation to help development on `scout-apm-client`.

## Typescript ##

The `scout-apm-client` codebase uses [Typescript](https://www.typescriptlang.org/), for the added safety and rigor. Typescript is fairly easy to read, but here's a quick introduction with some code from this codebase:

```typescript
// An string-based enumeration
// values in the enum LogLevel are listed below (ex. LogLevel.Info)
enum LogLevel {
    Info = "info",
    Warn = "warn",
    Debug = "debug",
    Trace = "trace",
    Error = "error",
}

// A partial sum type (disjoint union)
// a JSONValue (as defined below) is either an object, a string, or a number
type JSONValue = object | string | number;

// ApplicationMetadata is a "class" defined below is an object with the keys noted below
// the keys serverTime and framework are optional, but the others are required.
// the keys are publically accessible (public) but are readonly (so they may only be set at construction time)
class ApplicationMetadata {
    public readonly language: string;
    public readonly version: string;
    public readonly serverTime?: string;
    public readonly framework?: string;
}

// Functions specify their input argument types and output types
// level is an optional argument
function consoleLogFn(message: string, level?: LogLevel): string {
    level = level || LogLevel.Info;
    ....
    return message;
}

// This function returns whether some given object *is* an AgentResponseSuccessResult
// this is an relatively advanced typescript feature, as it gives a hint to the typechecker
function isSuccessfulResponseResult(obj: any): obj is AgentResponseSuccessResult {
    return obj && typeof obj === "string" && obj === "Success";
}
```

Typescript code is compiled/transpiled to the `dist` folder in the project, and the compiler can be controlled by editing the settings in `tsconfig.json`.

For a full introduction to typescript, check out [Typescript in 5 minutes](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html).
