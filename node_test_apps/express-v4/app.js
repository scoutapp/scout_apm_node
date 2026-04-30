const express = require("express");
const { scoutMiddleware, setupRequireIntegrations } = require("@scout_apm/scout-apm");
const { buildScoutConfiguration } = require("@scout_apm/scout-apm");

setupRequireIntegrations(["express"]);

const app = express();

const config = buildScoutConfiguration({
  name: process.env.SCOUT_NAME || "scout-express-v4-test",
  key: process.env.SCOUT_KEY || "test-key",
  monitor: process.env.SCOUT_MONITOR === "true",
  coreAgentDownload: process.env.SCOUT_CORE_AGENT_DOWNLOAD !== "false",
  coreAgentLaunch: process.env.SCOUT_CORE_AGENT_LAUNCH !== "false",
  allowShutdown: true,
});

app.use(scoutMiddleware({ config, requestTimeoutMs: 0 }));

app.get("/", (req, res) => {
  res.json({ status: "ok", framework: "express", version: 4 });
});

app.get("/user/:id", (req, res) => {
  res.json({ status: "ok", userId: req.params.id });
});

app.get("/slow", async (req, res) => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  res.json({ status: "ok", delayed: true });
});

app.get("/error", (req, res) => {
  throw new Error("intentional test error");
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Express v4 test app listening on port ${PORT}`);
});

module.exports = { app, server };
