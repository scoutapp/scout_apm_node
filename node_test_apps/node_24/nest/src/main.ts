import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import * as path from "path";

const mustacheExpress = require("mustache-express");
const { setupRequireIntegrations, nestMiddleware, buildScoutConfiguration } = require("@scout_apm/scout-apm");
const { CaptureAgent } = require("../capture-agent");
const { initDb } = require("../store");

// Hook require-in-the-middle integrations before any instrumented library loads
setupRequireIntegrations(["mustache", "pg", "http"]);

async function bootstrap() {
    const captureAgent = new CaptureAgent();
    await captureAgent.start();
    await initDb();

    const app = await NestFactory.create(AppModule, { logger: false });

    // Mustache view engine via the underlying Express instance
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.engine("mustache", mustacheExpress());
    expressApp.set("view engine", "mustache");
    expressApp.set("views", path.join(process.cwd(), "views"));

    // Scout APM middleware
    const config = buildScoutConfiguration({
        name: process.env.SCOUT_NAME || "scout-node24-nest-demo",
        key: process.env.SCOUT_KEY || "demo-key",
        monitor: true,
        coreAgentDownload: false,
        coreAgentLaunch: false,
        allowShutdown: true,
        socketPath: captureAgent.socketPath(),
    });
    app.use(nestMiddleware({ config, requestTimeoutMs: 0 }));

    const PORT = parseInt(process.env.PORT || "3003", 10);
    await app.listen(PORT, () => {
        console.log(`Node ${process.version} + NestJS app listening on port ${PORT}`);
    });
}

bootstrap().catch((err) => {
    console.error("Failed to start:", err);
    process.exit(1);
});
