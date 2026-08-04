import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { attachMediaStreamServer } from "./media-stream/media-stream.bootstrap";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks(["SIGTERM", "SIGINT"]);

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? "http://localhost:3000",
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Sprint 18 real-time Session Orchestrator -- raw Plivo Media Streams
  // WS server attached directly to the underlying HTTP server (see
  // media-stream.bootstrap.ts for why this isn't a Nest Gateway).
  attachMediaStreamServer(app);

  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
