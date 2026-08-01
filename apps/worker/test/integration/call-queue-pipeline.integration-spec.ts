import { randomUUID } from "node:crypto";

const mockCallsCreate = jest.fn().mockResolvedValue({
  apiId: "api-1",
  message: "call fired",
  requestUuid: "req-uuid-pipeline-it",
});

jest.mock("plivo", () => ({
  Client: jest.fn().mockImplementation(() => ({
    calls: { create: mockCallsCreate, hangup: jest.fn(), get: jest.fn() },
  })),
  validateSignature: jest.fn().mockReturnValue(true),
  Response: jest.fn().mockImplementation(() => ({
    addSpeak: jest.fn(),
    addRecord: jest.fn(),
    toXML: () => "<Response/>",
  })),
}));

// eslint-disable-next-line import/first
import { getQueueToken } from "@nestjs/bullmq";
// eslint-disable-next-line import/first
import { Test, type TestingModule } from "@nestjs/testing";
// eslint-disable-next-line import/first
import type { Queue } from "bullmq";
// eslint-disable-next-line import/first
import { TelephonyEncryption } from "@ai-voice-automation/telephony-core";

// eslint-disable-next-line import/first
import { PrismaService } from "../../src/common/prisma/prisma.service";
// eslint-disable-next-line import/first
import { QueueStatus } from "../../src/generated/prisma/client";
// eslint-disable-next-line import/first
import { CALL_QUEUE_NAME } from "../../src/queue/queue.constants";
// eslint-disable-next-line import/first
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
  let telephonyConfigId: string;

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
    telephonyConfigId = randomUUID();
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

    const encryption = new TelephonyEncryption(
      process.env.APP_ENCRYPTION_KEY ?? "",
    );
    const encryptedToken = encryption.encrypt("pipeline-it-auth-token");
    await prisma.$executeRaw`
      INSERT INTO "TelephonyConfig" (id, "workspaceId", provider, "authId", "authToken", "phoneNumber", "isActive", "createdAt", "updatedAt")
      VALUES (${telephonyConfigId}::uuid, ${workspaceId}::uuid, 'PLIVO', 'AC_pipeline_it', ${encryptedToken}, '+14155550000', true, now(), now())
    `;
  });

  afterAll(async () => {
    await prisma.call.deleteMany({ where: { workspaceId } });
    await prisma.$executeRaw`DELETE FROM "TelephonyConfig" WHERE id = ${telephonyConfigId}::uuid`;
    await prisma.callQueue.deleteMany({ where: { orderId } });
    await prisma.$executeRaw`DELETE FROM "Order" WHERE id = ${orderId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "Customer" WHERE id = ${customerId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${workspaceId}::uuid`;
    await queue.obliterate({ force: true }).catch(() => undefined);
    await moduleRef.close();
  });

  it("producer enqueues a due row into BullMQ, the processor places the call via Plivo, and drives it to COMPLETED", async () => {
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

    // The processor should have placed a real (mocked) Plivo call and
    // persisted the resulting Call row.
    expect(mockCallsCreate).toHaveBeenCalled();
    const call = await prisma.call.findFirst({
      where: { callQueueId: row.id },
    });
    expect(call).not.toBeNull();
    expect(call?.providerCallId).toBe("req-uuid-pipeline-it");
    expect(call?.status).toBe("RINGING");
  }, 20000);
});
