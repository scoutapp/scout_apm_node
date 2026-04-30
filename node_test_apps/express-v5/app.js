const express = require("express");
const { scoutMiddleware, setupRequireIntegrations } = require("@scout_apm/scout-apm");
const { buildScoutConfiguration } = require("@scout_apm/scout-apm");

setupRequireIntegrations(["express"]);

const app = express();

const config = buildScoutConfiguration({
  name: process.env.SCOUT_NAME || "scout-express-v5-test",
  key: process.env.SCOUT_KEY || "test-key",
  monitor: process.env.SCOUT_MONITOR === "true",
  coreAgentDownload: process.env.SCOUT_CORE_AGENT_DOWNLOAD !== "false",
  coreAgentLaunch: process.env.SCOUT_CORE_AGENT_LAUNCH !== "false",
  allowShutdown: true,
});

app.use(scoutMiddleware({ config, requestTimeoutMs: 0 }));

app.get("/", (req, res) => {
  res.json({ status: "ok", framework: "express", version: 5 });
});

app.get("/user/:id", (req, res) => {
  res.json({ status: "ok", userId: req.params.id });
});

app.get("/slow", async (req, res) => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  res.json({ status: "ok", delayed: true });
});

// Express 5 has proper async error propagation — no need for try/catch
app.get("/error", async (req, res) => {
  throw new Error("intentional test error");
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Express v5 test app listening on port ${PORT}`);
});

module.exports = { app, server };
