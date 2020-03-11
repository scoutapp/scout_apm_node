# Cookbook #

A few patterns that you may find helpful if implementing instrumentation on a legacy application that might not have deeper Scout support.

## Database operations ##

Expensive database operations can be traced in the context of a request (or even by themselves) by using `Scout` agent in the manual setting, or from inside a request:

```typescript
const scout = require("@scout_apm/scout-apm").expressMiddleware;
const express = require("express");
const app = express();

// ... your other set up code code ...

// Your custom endpoint
app.use("/your-endpoint", (req, res) => {
    // Start a scout span (one part of an overall request trace)
    req.scout
        .request // Access the ScoutRequest for this HTTP request
        .startSpan("Database/expensive-computation")
        .then(span => {

            // Perform your DB call (mongoose, pg, etc)
            yourDatabaseClient
                .expensiveComputation()
                .then(result => {
                    // Conclude the span (which will be rolled up into the request)
                    span.finish();
                    res.send(result);
                })
                .catch((err: Error) => {
                    span.finish();

                    // // (OPTIONAL) Add custom context to the request to help with error classification
                    // req.scout.request.addContext([
                    //     {name: "error", value: true},
                    //     {name: "error.stack", value: err.stack},
                    // ]);

                    // your custom error handler logic
                    res.send(yourErrorResult)
                });

       });
})
```

## Template rendering ##

When using a popular framework like [`pug`](https://github.com/pugjs/pug) and server-side generating text, you can use the `Scout` agent request in the manual setting

```
const express = require("express");
const app = express();
const scout = require("@scout_apm/scout-apm").expressMiddleware;

const pug = require("pug");

// ... your other set up code code ...

// Your custom endpoint
app.use("/your-endpoint", (req, res) => {
    // Start a scout span (one part of an overall request trace)
    req.scout
        .request // Access the ScoutRequest for this HTTP request
        .startSpan("Template/template-generation")
        .then(span => {

            // Perform your templating
            var options = ....;
            var html = pug.renderFile("template.pug", options);

            // Finish the scout span
            span.finish();

            // // (OPTIONAL) add context to the span with some information about the template that was rendered
            // req.scout.request.addContext([
            //   {name: "template.fileName", value: "template.pug"},
            // ]);

            res.send(result);
       });
})
```
