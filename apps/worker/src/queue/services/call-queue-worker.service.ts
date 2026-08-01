import { Inject, Injectable } from "@nestjs/common";

import { StructuredLogger } from "../../common/logger/structured-logger";
import { WorkerIdentityService } from "../../common/worker-identity/worker-identity.service";
import {
  CALL_PROCESSING_PROVIDER,
  type ICallProcessingProvider,
} from "../providers/call-processing.provider.interface";
import { QUEUE_MAX_ATTEMPTS } from "../queue.constants";
import {
  CALL_QUEUE_REPOSITORY,
  type ICallQueueRepository,
} from "../repositories/call-queue.repository.interface";

export type ProcessOutcome =
  | { type: "completed"; callQueueId: string }
  | { type: "already-claimed"; callQueueId: string }
  | { type: "requeued"; callQueueId: string; error: string; attempt: number }
  | { type: "failed"; callQueueId: string; error: string; attempt: number };

@Injectable()
export class CallQueueWorkerService {
  constructor(
    @Inject(CALL_QUEUE_REPOSITORY)
    private readonly repository: ICallQueueRepository,
    @Inject(CALL_PROCESSING_PROVIDER)
    private readonly provider: ICallProcessingProvider,
    private readonly workerIdentity: WorkerIdentityService,
    private readonly logger: StructuredLogger,
  ) {}

  async processCallQueueId(callQueueId: string): Promise<ProcessOutcome> {
    const claimed = await this.repository.claim(
      callQueueId,
      this.workerIdentity.workerId,
    );

    if (!claimed) {
      this.logger.event(
        "CallQueueWorkerService",
        "row already claimed or no longer queued, skipping",
        { callQueueId, workerId: this.workerIdentity.workerId },
      );
      return { type: "already-claimed", callQueueId };
    }

    this.logger.event("CallQueueWorkerService", "claimed row, processing", {
      callQueueId,
      orderId: claimed.orderId,
      workerId: this.workerIdentity.workerId,
      attempt: claimed.attemptCount + 1,
    });

    try {
      const result = await this.provider.process(claimed);

      if (!result.success) {
        throw new Error(result.message ?? "processing reported failure");
      }

      await this.repository.complete(callQueueId);
      this.logger.event("CallQueueWorkerService", "completed", {
        callQueueId,
      });
      return { type: "completed", callQueueId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempt = claimed.attemptCount + 1;

      if (attempt < QUEUE_MAX_ATTEMPTS) {
        await this.repository.requeue(callQueueId, message);
        this.logger.eventError(
          "CallQueueWorkerService",
          "processing failed, requeued for retry",
          error,
          { callQueueId, attempt, maxAttempts: QUEUE_MAX_ATTEMPTS },
        );
        return { type: "requeued", callQueueId, error: message, attempt };
      }

      await this.repository.fail(callQueueId, message);
      this.logger.eventError(
        "CallQueueWorkerService",
        "processing failed, attempts exhausted",
        error,
        { callQueueId, attempt, maxAttempts: QUEUE_MAX_ATTEMPTS },
      );
      return { type: "failed", callQueueId, error: message, attempt };
    }
  }
}
