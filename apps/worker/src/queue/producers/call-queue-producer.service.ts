import { InjectQueue } from "@nestjs/bullmq";
import { Inject, Injectable } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { Queue } from "bullmq";

import { StructuredLogger } from "../../common/logger/structured-logger";
import {
  BULLMQ_BACKOFF_BASE_DELAY_MS,
  BULLMQ_JOB_ATTEMPTS,
  CALL_QUEUE_JOB_NAME,
  CALL_QUEUE_NAME,
  QUEUE_LOCK_TTL_MS,
  QUEUE_POLL_BATCH_SIZE,
  QUEUE_POLL_INTERVAL_MS,
} from "../queue.constants";
import {
  CALL_QUEUE_REPOSITORY,
  type ICallQueueRepository,
} from "../repositories/call-queue.repository.interface";

export interface CallQueueJobData {
  callQueueId: string;
}

@Injectable()
export class CallQueueProducerService {
  private isPolling = false;

  constructor(
    @InjectQueue(CALL_QUEUE_NAME) private readonly queue: Queue<CallQueueJobData>,
    @Inject(CALL_QUEUE_REPOSITORY)
    private readonly repository: ICallQueueRepository,
    private readonly logger: StructuredLogger,
  ) {}

  @Interval(QUEUE_POLL_INTERVAL_MS)
  async poll(): Promise<void> {
    if (this.isPolling) {
      // A previous tick is still running (slow DB/Redis) -- skip this one
      // rather than overlapping polls.
      return;
    }

    this.isPolling = true;
    try {
      await this.recoverStaleLocks();
      await this.enqueueDueRows();
    } catch (error) {
      this.logger.eventError(
        "CallQueueProducerService",
        "poll tick failed",
        error,
      );
    } finally {
      this.isPolling = false;
    }
  }

  private async recoverStaleLocks(): Promise<void> {
    const staleBefore = new Date(Date.now() - QUEUE_LOCK_TTL_MS);
    const recovered = await this.repository.recoverStaleLocks(staleBefore);

    if (recovered > 0) {
      this.logger.event(
        "CallQueueProducerService",
        "recovered stale locks",
        { recovered, staleBefore: staleBefore.toISOString() },
      );
    }
  }

  private async enqueueDueRows(): Promise<void> {
    const due = await this.repository.findDue(QUEUE_POLL_BATCH_SIZE, new Date());

    for (const row of due) {
      await this.queue.add(
        CALL_QUEUE_JOB_NAME,
        { callQueueId: row.id },
        {
          jobId: row.id,
          attempts: BULLMQ_JOB_ATTEMPTS,
          backoff: { type: "exponential", delay: BULLMQ_BACKOFF_BASE_DELAY_MS },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      );
    }

    if (due.length > 0) {
      this.logger.event("CallQueueProducerService", "enqueued due rows", {
        count: due.length,
      });
    }
  }
}
