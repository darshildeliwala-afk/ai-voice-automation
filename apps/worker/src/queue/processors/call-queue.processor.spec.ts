import type { Job } from "bullmq";

import { StructuredLogger } from "../../common/logger/structured-logger";
import type { CallQueueWorkerService } from "../services/call-queue-worker.service";
import { CallQueueProcessor } from "./call-queue.processor";

function setup() {
  const workerService = { processCallQueueId: jest.fn() };
  const logger = new StructuredLogger();
  jest.spyOn(logger, "event").mockImplementation(() => undefined);

  const processor = new CallQueueProcessor(
    workerService as unknown as CallQueueWorkerService,
    logger,
  );

  return { processor, workerService };
}

function fakeJob(callQueueId: string): Job<{ callQueueId: string }> {
  return {
    id: "job-1",
    data: { callQueueId },
    attemptsMade: 0,
  } as Job<{ callQueueId: string }>;
}

describe("CallQueueProcessor", () => {
  it("does not throw when the outcome is completed", async () => {
    const { processor, workerService } = setup();
    workerService.processCallQueueId.mockResolvedValue({
      type: "completed",
      callQueueId: "row-1",
    });

    await expect(processor.process(fakeJob("row-1"))).resolves.toBeUndefined();
  });

  it("does not throw when the outcome is already-claimed", async () => {
    const { processor, workerService } = setup();
    workerService.processCallQueueId.mockResolvedValue({
      type: "already-claimed",
      callQueueId: "row-1",
    });

    await expect(processor.process(fakeJob("row-1"))).resolves.toBeUndefined();
  });

  it("does not throw when the outcome is a terminal failure (already recorded FAILED)", async () => {
    const { processor, workerService } = setup();
    workerService.processCallQueueId.mockResolvedValue({
      type: "failed",
      callQueueId: "row-1",
      error: "boom",
      attempt: 3,
    });

    await expect(processor.process(fakeJob("row-1"))).resolves.toBeUndefined();
  });

  it("throws to trigger BullMQ's backoff when the outcome is requeued", async () => {
    const { processor, workerService } = setup();
    workerService.processCallQueueId.mockResolvedValue({
      type: "requeued",
      callQueueId: "row-1",
      error: "boom",
      attempt: 1,
    });

    await expect(processor.process(fakeJob("row-1"))).rejects.toThrow("boom");
  });
});
