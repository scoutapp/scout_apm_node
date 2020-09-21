/* global module, process, require */
const express = require('express');

// Report memory usage
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
server.get('/', (req, res) => {
  process.send("request-processed");
  res.status(200).send('Hello world');
});

async function start() {
  // Start the express server
  await server.listen(process.env.PORT, () => {
    process.send("server-started");
    console.log('server started on port 3000');
  });
}

if (require.main === module) { start(); }
