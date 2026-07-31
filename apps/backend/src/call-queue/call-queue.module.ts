import { Module } from "@nestjs/common";

import { CallQueueService } from "./call-queue.service";

@Module({
  providers: [CallQueueService],
  exports: [CallQueueService],
})
export class CallQueueModule {}
