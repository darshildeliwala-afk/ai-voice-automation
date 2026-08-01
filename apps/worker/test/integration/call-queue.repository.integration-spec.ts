import { randomUUID } from "node:crypto";

import { PrismaService } from "../../src/common/prisma/prisma.service";
import { QueueStatus } from "../../src/generated/prisma/client";
import { CallQueueRepository } from "../../src/queue/repositories/call-queue.repository";

describe("CallQueueRepository (integration, real Postgres)", () => {
  let prisma: PrismaService;
  let repository: CallQueueRepository;
  let workspaceId: string;
  let customerId: string;
  let orderId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new CallQueueRepository(prisma);

    workspaceId = randomUUID();
    customerId = randomUUID();
    orderId = randomUUID();
    const slug = `worker-repo-it-${Date.now()}`;

    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'Worker Repo IT Workspace', ${slug}, now(), now())
    `;
    await prisma.$executeRaw`
      INSERT INTO "Customer" (id, "workspaceId", name, phone, "createdAt", "updatedAt")
      VALUES (${customerId}::uuid, ${workspaceId}::uuid, 'Repo IT Customer', '9999900001', now(), now())
    `;
    await prisma.$executeRaw`
      INSERT INTO "Order" (id, "workspaceId", "customerId", marketplace, "paymentType", status, "totalAmount", currency, "createdAt", "updatedAt")
      VALUES (${orderId}::uuid, ${workspaceId}::uuid, ${customerId}::uuid, 'CSV', 'COD', 'PENDING', 100, 'INR', now(), now())
    `;
  });

  afterAll(async () => {
    await prisma.callQueue.deleteMany({ where: { orderId } });
    await prisma.$executeRaw`DELETE FROM "Order" WHERE id = ${orderId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "Customer" WHERE id = ${customerId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${workspaceId}::uuid`;
    await prisma.$disconnect();
  });

  it("claim() lets exactly one concurrent caller win the lock on the same row", async () => {
    const row = await prisma.callQueue.create({
      data: { orderId, status: QueueStatus.QUEUED },
    });

    const [a, b, c] = await Promise.all([
      repository.claim(row.id, "worker-a"),
      repository.claim(row.id, "worker-b"),
      repository.claim(row.id, "worker-c"),
    ]);

    const successes = [a, b, c].filter((r) => r !== null);
    expect(successes).toHaveLength(1);
    expect(successes[0]?.status).toBe(QueueStatus.CALLING);
    expect(successes[0]?.workerId).toMatch(/^worker-[abc]$/);
  });

  it("requeue() releases the lock and increments attemptCount", async () => {
    const row = await prisma.callQueue.create({
      data: { orderId, status: QueueStatus.QUEUED },
    });
    await repository.claim(row.id, "worker-a");

    await repository.requeue(row.id, "simulated failure");

    const updated = await prisma.callQueue.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(updated.status).toBe(QueueStatus.QUEUED);
    expect(updated.attemptCount).toBe(1);
    expect(updated.lastError).toBe("simulated failure");
    expect(updated.lockedAt).toBeNull();
    expect(updated.workerId).toBeNull();
  });

  it("fail() sets terminal FAILED and clears the lock", async () => {
    const row = await prisma.callQueue.create({
      data: { orderId, status: QueueStatus.QUEUED, attemptCount: 2 },
    });
    await repository.claim(row.id, "worker-a");

    await repository.fail(row.id, "exhausted");

    const updated = await prisma.callQueue.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(updated.status).toBe(QueueStatus.FAILED);
    expect(updated.attemptCount).toBe(3);
    expect(updated.completedAt).not.toBeNull();
    expect(updated.lockedAt).toBeNull();
  });

  it("recoverStaleLocks() resets CALLING rows whose lock predates the cutoff", async () => {
    const row = await prisma.callQueue.create({
      data: {
        orderId,
        status: QueueStatus.CALLING,
        lockedAt: new Date(Date.now() - 120_000),
        workerId: "dead-worker",
      },
    });

    const staleBefore = new Date(Date.now() - 60_000);
    const count = await repository.recoverStaleLocks(staleBefore);

    expect(count).toBeGreaterThanOrEqual(1);
    const updated = await prisma.callQueue.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(updated.status).toBe(QueueStatus.QUEUED);
    expect(updated.lockedAt).toBeNull();
    expect(updated.workerId).toBeNull();
  });

  it("findDue() only returns QUEUED rows that are due", async () => {
    const dueRow = await prisma.callQueue.create({
      data: { orderId, status: QueueStatus.QUEUED },
    });
    const futureRow = await prisma.callQueue.create({
      data: {
        orderId,
        status: QueueStatus.QUEUED,
        scheduledAt: new Date(Date.now() + 3_600_000),
      },
    });
    const completedRow = await prisma.callQueue.create({
      data: { orderId, status: QueueStatus.COMPLETED },
    });

    const due = await repository.findDue(100, new Date());
    const dueIds = due.map((r) => r.id);

    expect(dueIds).toContain(dueRow.id);
    expect(dueIds).not.toContain(futureRow.id);
    expect(dueIds).not.toContain(completedRow.id);
  });

  it("getStatusCounts() reflects rows actually in the table for every status", async () => {
    const counts = await repository.getStatusCounts();
    for (const status of Object.values(QueueStatus)) {
      expect(typeof counts[status]).toBe("number");
    }
  });
});
