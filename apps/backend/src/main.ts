import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

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

  // Sprint 20 admin portal API docs.
  const swaggerConfig = new DocumentBuilder()
    .setTitle("AI Voice Automation -- Admin Portal API")
    .setDescription("Sprint 20 admin portal backend API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    "api-docs",
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  // Sprint 18 real-time Session Orchestrator -- raw Plivo Media Streams
  // WS server attached directly to the underlying HTTP server (see
  // media-stream.bootstrap.ts for why this isn't a Nest Gateway).
  attachMediaStreamServer(app);

  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
