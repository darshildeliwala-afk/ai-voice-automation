import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { EncryptionModule } from "../common/encryption/encryption.module";
import { LoggerModule } from "../common/logger/logger.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { parseRedisUrl } from "../common/redis/redis-options.util";
import { WorkerIdentityModule } from "../common/worker-identity/worker-identity.module";
import { CallQueueProducerService } from "./producers/call-queue-producer.service";
import { CallQueueProcessor } from "./processors/call-queue.processor";
import {
  CALL_PROCESSING_PROVIDER,
} from "./providers/call-processing.provider.interface";
import { PlivoCallProcessingProvider } from "./providers/plivo-call-processing.provider";
import { CALL_QUEUE_NAME } from "./queue.constants";
import { CallQueueRepository } from "./repositories/call-queue.repository";
import { CALL_QUEUE_REPOSITORY } from "./repositories/call-queue.repository.interface";
import { CallQueueWorkerService } from "./services/call-queue-worker.service";

@Module({
  imports: [
    PrismaModule,
    LoggerModule,
    WorkerIdentityModule,
    EncryptionModule,
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: parseRedisUrl(
          process.env.REDIS_URL ?? "redis://localhost:6379",
        ),
      }),
    }),
    BullModule.registerQueue({ name: CALL_QUEUE_NAME }),
  ],
  providers: [
    { provide: CALL_QUEUE_REPOSITORY, useClass: CallQueueRepository },
    {
      provide: CALL_PROCESSING_PROVIDER,
      useClass: PlivoCallProcessingProvider,
    },
    CallQueueWorkerService,
    CallQueueProducerService,
    CallQueueProcessor,
  ],
  exports: [CALL_QUEUE_REPOSITORY, BullModule],
})
export class QueueModule {}
