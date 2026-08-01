import { InjectQueue } from "@nestjs/bullmq";
import { Controller, Get, Inject } from "@nestjs/common";
import type { Queue } from "bullmq";

import { CALL_QUEUE_NAME } from "../queue/queue.constants";
import {
  CALL_QUEUE_REPOSITORY,
  type ICallQueueRepository,
} from "../queue/repositories/call-queue.repository.interface";

@Controller("queue/metrics")
export class MetricsController {
  constructor(
    @InjectQueue(CALL_QUEUE_NAME) private readonly queue: Queue,
    @Inject(CALL_QUEUE_REPOSITORY)
    private readonly repository: ICallQueueRepository,
  ) {}

  @Get()
  async getMetrics() {
    const [bullmq, database] = await Promise.all([
      this.queue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed",
        "paused",
      ),
      this.repository.getStatusCounts(),
    ]);

    return {
      queue: CALL_QUEUE_NAME,
      timestamp: new Date().toISOString(),
      bullmq,
      database,
    };
  }
}
