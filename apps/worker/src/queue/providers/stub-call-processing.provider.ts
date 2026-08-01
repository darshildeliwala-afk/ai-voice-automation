import { Injectable } from "@nestjs/common";

import { StructuredLogger } from "../../common/logger/structured-logger";
import type { CallQueue } from "../../generated/prisma/client";
import type {
  CallProcessingResult,
  ICallProcessingProvider,
} from "./call-processing.provider.interface";

const SIMULATED_WORK_MS = 50;

/**
 * Placeholder implementation. Simulates a unit of work so the queue
 * lifecycle (claim -> process -> complete/fail) can be exercised end to
 * end without any telephony or AI provider integrated yet.
 */
@Injectable()
export class StubCallProcessingProvider implements ICallProcessingProvider {
  constructor(private readonly logger: StructuredLogger) {}

  async process(job: CallQueue): Promise<CallProcessingResult> {
    this.logger.event(
      "StubCallProcessingProvider",
      "simulating call processing",
      { callQueueId: job.id, orderId: job.orderId },
    );

    await new Promise((resolve) => setTimeout(resolve, SIMULATED_WORK_MS));

    return {
      success: true,
      message: "stub: no telephony/AI provider integrated yet",
    };
  }
}
