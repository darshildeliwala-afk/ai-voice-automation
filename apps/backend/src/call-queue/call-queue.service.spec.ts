import { NotFoundException } from "@nestjs/common";

import { QueueStatus } from "../generated/prisma/client";
import { CallQueueService } from "./call-queue.service";

function setup() {
  const callQueue = {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const prisma = {
    callQueue,
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback({ callQueue }),
    ),
  };

  const service = new CallQueueService(prisma as never);

  return { service, prisma, callQueue };
}

describe("CallQueueService", () => {
  it("enqueue() creates a QUEUED row for the given order", async () => {
    const { service, callQueue } = setup();
    callQueue.create.mockResolvedValue({ id: "q1", status: QueueStatus.QUEUED });

    await service.enqueue("order-1");

    expect(callQueue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: "order-1",
          status: QueueStatus.QUEUED,
        }),
      }),
    );
  });

  describe("findById", () => {
    it("returns the row when found", async () => {
      const { service, callQueue } = setup();
      callQueue.findFirst.mockResolvedValue({ id: "q1" });

      const result = await service.findById("q1");

      expect(result).toEqual({ id: "q1" });
    });

    it("throws NotFoundException when missing", async () => {
      const { service, callQueue } = setup();
      callQueue.findFirst.mockResolvedValue(null);

      await expect(service.findById("missing")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("expediteNow", () => {
    it("sets status QUEUED and scheduledAt=now for a non-CALLING row", async () => {
      const { service, callQueue } = setup();
      callQueue.findFirst.mockResolvedValue({
        id: "q1",
        status: QueueStatus.FAILED,
      });
      callQueue.update.mockResolvedValue({
        id: "q1",
        status: QueueStatus.QUEUED,
      });

      const result = await service.expediteNow("q1");

      expect(callQueue.update).toHaveBeenCalledWith({
        where: { id: "q1" },
        data: { status: QueueStatus.QUEUED, scheduledAt: expect.any(Date) },
      });
      expect(result.status).toBe(QueueStatus.QUEUED);
    });

    it("is a no-op when the row is already CALLING (being processed)", async () => {
      const { service, callQueue } = setup();
      callQueue.findFirst.mockResolvedValue({
        id: "q1",
        status: QueueStatus.CALLING,
      });

      const result = await service.expediteNow("q1");

      expect(callQueue.update).not.toHaveBeenCalled();
      expect(result.status).toBe(QueueStatus.CALLING);
    });

    it("throws NotFoundException when the row does not exist", async () => {
      const { service, callQueue } = setup();
      callQueue.findFirst.mockResolvedValue(null);

      await expect(service.expediteNow("missing")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("complete", () => {
    it("sets status COMPLETED", async () => {
      const { service, callQueue } = setup();
      callQueue.findFirst.mockResolvedValue({ id: "q1" });
      callQueue.update.mockResolvedValue({
        id: "q1",
        status: QueueStatus.COMPLETED,
      });

      await service.complete("q1");

      expect(callQueue.update).toHaveBeenCalledWith({
        where: { id: "q1" },
        data: { status: QueueStatus.COMPLETED },
      });
    });
  });

  describe("fail", () => {
    it("requeues (status QUEUED) when attempts remain", async () => {
      const { service, callQueue } = setup();
      callQueue.findFirst.mockResolvedValue({
        id: "q1",
        attemptCount: 0,
      });
      callQueue.update.mockResolvedValue({ id: "q1" });

      await service.fail("q1", "boom");

      expect(callQueue.update).toHaveBeenCalledWith({
        where: { id: "q1" },
        data: { attemptCount: 1, status: QueueStatus.QUEUED, lastError: "boom" },
      });
    });

    it("marks FAILED once max attempts are exhausted", async () => {
      const { service, callQueue } = setup();
      callQueue.findFirst.mockResolvedValue({
        id: "q1",
        attemptCount: 2,
      });
      callQueue.update.mockResolvedValue({ id: "q1" });

      await service.fail("q1", "boom");

      expect(callQueue.update).toHaveBeenCalledWith({
        where: { id: "q1" },
        data: { attemptCount: 3, status: QueueStatus.FAILED, lastError: "boom" },
      });
    });
  });
});
