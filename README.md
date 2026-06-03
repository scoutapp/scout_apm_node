# Scout APM Node.js Agent

Monitor the performance of Node.js apps with [Scout APM](https://www.scoutapm.com). Detailed performance metrics and transactional traces are collected once the `@scout_apm/scout-apm` package is installed and configured.

## Requirements

- **Node.js** ≥ 18
- **npm** or **yarn**

Scout APM works with the following frameworks out of the box:

- [Express](https://expressjs.com) 4.x / 5.x
- [NestJS](https://nestjs.com) 10+

## Installation

```shell
npm install @scout_apm/scout-apm
```

## Quick Start

### Express

```javascript
const scout = require("@scout_apm/scout-apm");
const express = require("express");

const app = express();

// Scout middleware must be registered before your routes
app.use(scout.expressMiddleware());

app.get("/", (req, res) => {
  // Add custom context synchronously; use scout.api.Context.add() in async handlers
  scout.api.Context.addSync("user_id", req.user?.id);
  res.send("hello, world!");
});

async function start() {
  await scout.init({
    name: "<application name>",
    key: "<scout key>",
    monitor: true,
  });

  app.listen(3000);
}

start();
```

### TypeScript

Types are included — no `@types` package needed.

```typescript
import * as scout from "@scout_apm/scout-apm";
import express from "express";

const app = express();

app.use(scout.expressMiddleware());

async function start(): Promise<void> {
  await scout.init({
    name: "my-app",
    key: process.env.SCOUT_KEY!,
    monitor: true,
  });

  app.listen(3000);
}

start();
```

### NestJS

```typescript
import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { nestMiddleware, nestErrorFilter } from "@scout_apm/scout-apm";

@Module({
  providers: [{ provide: APP_FILTER, useClass: nestErrorFilter() }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(nestMiddleware()).forRoutes("*");
  }
}
```

## Configuration

Configuration can be passed to `scout.init()` or set via environment variables:

| Option | ENV variable | Description |
|--------|-------------|-------------|
| `name` | `SCOUT_NAME` | Application name shown in Scout UI |
| `key` | `SCOUT_KEY` | Scout APM API key |
| `monitor` | `SCOUT_MONITOR` | Enable/disable monitoring (`true`/`false`) |
| `logLevel` | `SCOUT_LOG_LEVEL` | Log verbosity (`debug`, `info`, `warn`, `error`) |

For the full configuration reference, see [`docs/configuration.md`](docs/configuration.md).

## Supported Integrations

Database and template integrations are auto-activated when the corresponding package is `require`d. Framework integrations (Express, NestJS) require explicit middleware registration — see the Quick Start examples above.

| Package | Status | Description |
|---------|--------|-------------|
| `http` | STABLE | Node.js built-in `http` module |
| `https` | STABLE | Node.js built-in `https` module |
| `express` | STABLE | [Express](https://www.npmjs.com/package/express) 4.x / 5.x web framework |
| `NestJS` | STABLE | [NestJS](https://nestjs.com) 10+ (via `nestMiddleware` / `nestErrorFilter`) |
| `pg` | STABLE | [node-postgres](https://www.npmjs.com/package/pg) driver |
| `mysql` | STABLE | [mysql](https://www.npmjs.com/package/mysql) driver |
| `mysql2` | STABLE | [mysql2](https://www.npmjs.com/package/mysql2) driver |
| `mongodb` | STABLE | [MongoDB](https://www.npmjs.com/package/mongodb) driver v4+ |
| `prisma` | STABLE | [Prisma](https://www.prisma.io) ORM (Prisma 6+) |
| `ioredis` | STABLE | [ioredis](https://www.npmjs.com/package/ioredis) Redis client |
| `redis` | STABLE | [node-redis](https://www.npmjs.com/package/redis) v5+ |
| `ejs` | STABLE | [EJS](https://www.npmjs.com/package/ejs) templating |
| `mustache` | STABLE | [Mustache](https://github.com/janl/mustache.js/) templating |
| `pug` | STABLE | [Pug](https://pugjs.org) templating |
| `fetch` | STABLE | Node.js built-in `fetch` (Node 18+, via `diagnostics_channel`) |

## Custom Instrumentation

### Web transactions

```javascript
await scout.api.WebTransaction.run("GET /my-route", async (finishTransaction) => {
  await doWork();
  finishTransaction();
});
```

### Background jobs

```javascript
await scout.api.BackgroundTransaction.run("send-welcome-email", async (finishTransaction) => {
  await sendEmail(user);
  finishTransaction();
});
```

### Custom spans

```javascript
await scout.instrument("MyOperation", async (finishSpan) => {
  const result = await expensiveOperation();
  finishSpan();
  return result;
});
```

### Custom context

```javascript
// Async
await scout.api.Context.add("user_id", userId);

// Sync
scout.api.Context.addSync("plan", "enterprise");
```

## Node Version Support

| Node version | Supported |
|-------------|-----------|
| 18.x | ✓ |
| 20.x | ✓ |
| 22.x | ✓ |
| 24.x | ✓ |

Node < 18 is not supported. The agent uses `AsyncLocalStorage` (available since Node 12, but Node 18 is our tested minimum and the current LTS baseline).

## Development

```shell
# Install dependencies
yarn install

# Build TypeScript
npm run build

# Run linter
npm run lint

# Run tests (requires a running core-agent and test databases)
npm run test-unit
npm run test-int
npm run test-integration-pg
npm run test-integration-mysql
```

## Contributing

1. Fork and clone this repository
2. Run `yarn install` to install dependencies
3. Run `npm run build` to compile TypeScript
4. Write your change and add tests
5. Run `npm run lint && npm run test-unit` to verify
6. Submit a PR

## Documentation

For full installation and troubleshooting documentation, visit our [help site](http://help.apm.scoutapm.com/#nodejs-client).

## Support

Contact us at [support@scoutapm.com](mailto:support@scoutapm.com) or [open an issue](https://github.com/scoutapp/scout_apm_node/issues/new).
