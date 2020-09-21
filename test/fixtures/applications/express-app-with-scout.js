/* global module, process, require */
const scout = require('@scout_apm/scout-apm');
const express = require('express');

const server = express();

server.use(scout.expressMiddleware());

server.get('/', (req, res) => {
  process.send("request-processed");
  res.status(200).send('Hello world');
});

async function start() {
  // Install scout
  await scout.install({
    allowShutdown: true,
    monitor: true,
    name: 'example-app',
    key: 'examplekey',
  });
  process.send("scout-install-completed");

  // Start the express server
  await server.listen(3000, () => {
    process.send("server-started");
    console.log('server started on port 3000');
  });
}

if (require.main === module) { start(); }
