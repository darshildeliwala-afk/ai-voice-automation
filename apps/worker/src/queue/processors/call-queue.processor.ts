import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";

import { StructuredLogger } from "../../common/logger/structured-logger";
import type { CallQueueJobData } from "../producers/call-queue-producer.service";
import { CALL_QUEUE_NAME } from "../queue.constants";
import { CallQueueWorkerService } from "../services/call-queue-worker.service";

const PROCESSOR_CONCURRENCY = 5;

@Processor(CALL_QUEUE_NAME, { concurrency: PROCESSOR_CONCURRENCY })
export class CallQueueProcessor extends WorkerHost {
  constructor(
    private readonly workerService: CallQueueWorkerService,
    private readonly logger: StructuredLogger,
  ) {
    super();
  }

  async process(job: Job<CallQueueJobData>): Promise<void> {
    const { callQueueId } = job.data;

    this.logger.event("CallQueueProcessor", "received job", {
      jobId: job.id,
      callQueueId,
      bullAttempt: job.attemptsMade + 1,
    });

    const outcome = await this.workerService.processCallQueueId(callQueueId);

    if (outcome.type === "requeued") {
      // The DB row is already back to QUEUED with the lock released; throw
      // so BullMQ's own exponential backoff drives when this same job
      // (same jobId) is retried.
      throw new Error(outcome.error);
    }
  }
}
