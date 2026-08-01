import { QueueStatus } from "../../generated/prisma/client";
import { CallQueueRepository } from "./call-queue.repository";

function createPrismaMock() {
  return {
    callQueue: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
  };
}

describe("CallQueueRepository", () => {
  it("claim() returns null when no row matched (already claimed)", async () => {
    const prisma = createPrismaMock();
    prisma.callQueue.updateMany.mockResolvedValue({ count: 0 });
    const repo = new CallQueueRepository(prisma as never);

    const result = await repo.claim("id-1", "worker-1");

    expect(result).toBeNull();
    expect(prisma.callQueue.findUnique).not.toHaveBeenCalled();
  });

  it("claim() atomically sets CALLING/lockedAt/workerId and returns the row when successful", async () => {
    const prisma = createPrismaMock();
    prisma.callQueue.updateMany.mockResolvedValue({ count: 1 });
    const row = { id: "id-1", status: QueueStatus.CALLING };
    prisma.callQueue.findUnique.mockResolvedValue(row);
    const repo = new CallQueueRepository(prisma as never);

    const result = await repo.claim("id-1", "worker-1");

    expect(prisma.callQueue.updateMany).toHaveBeenCalledWith({
      where: { id: "id-1", status: QueueStatus.QUEUED },
      data: expect.objectContaining({
        status: QueueStatus.CALLING,
        workerId: "worker-1",
      }),
    });
    expect(result).toBe(row);
  });

  it("requeue() releases the lock, increments attemptCount, and returns to QUEUED", async () => {
    const prisma = createPrismaMock();
    const repo = new CallQueueRepository(prisma as never);

    await repo.requeue("id-1", "boom");

    expect(prisma.callQueue.update).toHaveBeenCalledWith({
      where: { id: "id-1" },
      data: {
        status: QueueStatus.QUEUED,
        attemptCount: { increment: 1 },
        lastError: "boom",
        lockedAt: null,
        workerId: null,
      },
    });
  });

  it("fail() sets terminal FAILED status and clears the lock", async () => {
    const prisma = createPrismaMock();
    const repo = new CallQueueRepository(prisma as never);

    await repo.fail("id-1", "boom");

    expect(prisma.callQueue.update).toHaveBeenCalledWith({
      where: { id: "id-1" },
      data: expect.objectContaining({
        status: QueueStatus.FAILED,
        lockedAt: null,
        workerId: null,
      }),
    });
  });

  it("recoverStaleLocks() resets CALLING rows with an old lockedAt back to QUEUED", async () => {
    const prisma = createPrismaMock();
    prisma.callQueue.updateMany.mockResolvedValue({ count: 2 });
    const repo = new CallQueueRepository(prisma as never);

    const staleBefore = new Date();
    const count = await repo.recoverStaleLocks(staleBefore);

    expect(count).toBe(2);
    expect(prisma.callQueue.updateMany).toHaveBeenCalledWith({
      where: { status: QueueStatus.CALLING, lockedAt: { lt: staleBefore } },
      data: { status: QueueStatus.QUEUED, lockedAt: null, workerId: null },
    });
  });

  it("getStatusCounts() returns a count per QueueStatus, defaulting missing statuses to 0", async () => {
    const prisma = createPrismaMock();
    prisma.callQueue.groupBy.mockResolvedValue([
      { status: QueueStatus.QUEUED, _count: { _all: 3 } },
    ]);
    const repo = new CallQueueRepository(prisma as never);

    const counts = await repo.getStatusCounts();

    expect(counts[QueueStatus.QUEUED]).toBe(3);
    expect(counts[QueueStatus.COMPLETED]).toBe(0);
  });
});
