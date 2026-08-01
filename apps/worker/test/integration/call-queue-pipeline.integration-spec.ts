import { randomUUID } from "node:crypto";

import { getQueueToken } from "@nestjs/bullmq";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Queue } from "bullmq";

import { PrismaService } from "../../src/common/prisma/prisma.service";
import { QueueStatus } from "../../src/generated/prisma/client";
import { CALL_QUEUE_NAME } from "../../src/queue/queue.constants";
import { QueueModule } from "../../src/queue/queue.module";

async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs = 15000,
  intervalMs = 250,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("waitFor timed out");
}

describe("Call queue pipeline (integration: Postgres + Redis + BullMQ)", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let queue: Queue;
  let workspaceId: string;
  let customerId: string;
  let orderId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [QueueModule],
    }).compile();

    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    queue = moduleRef.get(getQueueToken(CALL_QUEUE_NAME));

    workspaceId = randomUUID();
    customerId = randomUUID();
    orderId = randomUUID();
    const slug = `worker-pipeline-it-${Date.now()}`;

    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'Pipeline IT Workspace', ${slug}, now(), now())
    `;
    await prisma.$executeRaw`
      INSERT INTO "Customer" (id, "workspaceId", name, phone, "createdAt", "updatedAt")
      VALUES (${customerId}::uuid, ${workspaceId}::uuid, 'Pipeline IT Customer', '8888800001', now(), now())
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
    await queue.obliterate({ force: true }).catch(() => undefined);
    await moduleRef.close();
  });

  it("producer enqueues a due row into BullMQ and the processor drives it to COMPLETED", async () => {
    const row = await prisma.callQueue.create({
      data: { orderId, status: QueueStatus.QUEUED },
    });

    await waitFor(async () => {
      const updated = await prisma.callQueue.findUniqueOrThrow({
        where: { id: row.id },
      });
      return updated.status === QueueStatus.COMPLETED;
    });

    const final = await prisma.callQueue.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(final.status).toBe(QueueStatus.COMPLETED);
    expect(final.completedAt).not.toBeNull();
    expect(final.startedAt).not.toBeNull();
    expect(final.workerId).toBeNull();
    expect(final.lockedAt).toBeNull();

    const bullJob = await queue.getJob(row.id);
    expect(bullJob).toBeDefined();
  }, 20000);
});
