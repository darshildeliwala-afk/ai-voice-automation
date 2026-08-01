import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { StructuredLogger } from "./common/logger/structured-logger";
import { WorkerIdentityService } from "./common/worker-identity/worker-identity.service";

async function bootstrap() {
  const logger = new StructuredLogger();
  const app = await NestFactory.create(AppModule, { logger });

  app.enableShutdownHooks(["SIGTERM", "SIGINT"]);

  const workerIdentity = app.get(WorkerIdentityService);
  const port = process.env.PORT ?? 3010;

  const shutdown = (signal: string) => {
    logger.event("Bootstrap", "shutdown signal received, draining queue", {
      signal,
      workerId: workerIdentity.workerId,
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await app.listen(port);

  logger.event("Bootstrap", "worker started", {
    workerId: workerIdentity.workerId,
    port,
  });
}

void bootstrap();
