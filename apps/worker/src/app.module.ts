import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { LoggerModule } from "./common/logger/logger.module";
import { PrismaModule } from "./common/prisma/prisma.module";
import { WorkerIdentityModule } from "./common/worker-identity/worker-identity.module";
import { HealthModule } from "./health/health.module";
import { MetricsModule } from "./metrics/metrics.module";
import { QueueModule } from "./queue/queue.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    LoggerModule,
    PrismaModule,
    WorkerIdentityModule,
    QueueModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule {}
