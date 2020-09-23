/* global module, process, require */

// Work out the relative path of ScoutJS compiled lib
const path = require("path");

const scout = require('../../../dist/lib');
const express = require('express');

// Setup process message hooks
process.on("message", msg => {
  if (!msg) { return; }

  // Handle memory usage requests
  if (msg === "report-memory-usage") {
    process.send({
      msgType: "memory-usage-report",
      memoryUsageJSON: JSON.stringify(process.memoryUsage()),
    });
  }
});

// Setup express server
const server = express();
server.use(scout.expressMiddleware());
server.get('/', (req, res) => {
  process.send("request-processed");
  res.status(200).send('Hello world');
});

async function start() {
  // Install scout (ENV should provide necessary opts)
  await scout.install();
  process.send("scout-install-completed");

  // Start the express server
  await server.listen(process.env.PORT, () => {
    process.send("server-started");
    console.log(`server started on port ${process.env.PORT}`);
  });
}

if (require.main === module) { start(); }
