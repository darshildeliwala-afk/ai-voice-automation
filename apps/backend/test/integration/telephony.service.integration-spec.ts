import { randomUUID } from "node:crypto";

jest.mock("plivo", () => ({
  Client: jest.fn().mockImplementation(() => ({
    calls: {
      create: jest.fn(),
      hangup: jest.fn().mockResolvedValue({ apiId: "api-1" }),
      get: jest.fn(),
    },
  })),
  validateSignature: jest.fn().mockReturnValue(true),
  Response: jest.fn().mockImplementation(() => ({
    addSpeak: jest.fn(),
    addRecord: jest.fn(),
    toXML: () => "<Response/>",
  })),
}));

// eslint-disable-next-line import/first
import { BadRequestException } from "@nestjs/common";
// eslint-disable-next-line import/first
import { TelephonyConfigMissingError } from "@ai-voice-automation/telephony-core";

// eslint-disable-next-line import/first
import { CallQueueService } from "../../src/call-queue/call-queue.service";
// eslint-disable-next-line import/first
import { EncryptionService } from "../../src/common/encryption/encryption.service";
// eslint-disable-next-line import/first
import { PrismaService } from "../../src/common/prisma/prisma.service";
// eslint-disable-next-line import/first
import { CustomerService } from "../../src/customer/customer.service";
// eslint-disable-next-line import/first
import { OrderService } from "../../src/order/order.service";
// eslint-disable-next-line import/first
import { QueueStatus } from "../../src/generated/prisma/client";
// eslint-disable-next-line import/first
import { TelephonyProviderFactory } from "../../src/telephony/providers/telephony-provider.factory";
// eslint-disable-next-line import/first
import { TelephonyService } from "../../src/telephony/telephony.service";
// eslint-disable-next-line import/first
import { TelephonyConfigService } from "../../src/workspace-settings/telephony-config.service";
// eslint-disable-next-line import/first
import { WorkspaceService } from "../../src/workspace/workspace.service";

describe("TelephonyService (integration, real Postgres)", () => {
  let prisma: PrismaService;
  let service: TelephonyService;
  let workspaceId: string;
  let customerId: string;
  let orderId: string;
  let queueId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const workspaceService = new WorkspaceService(prisma);
    const customerService = new CustomerService(prisma, workspaceService);
    const orderService = new OrderService(prisma, customerService);
    const callQueueService = new CallQueueService(prisma);
    const encryptionService = new EncryptionService();
    const telephonyConfigService = new TelephonyConfigService(
      prisma,
      workspaceService,
      encryptionService,
    );
    const providerFactory = new TelephonyProviderFactory(
      telephonyConfigService,
    );

    service = new TelephonyService(
      prisma,
      orderService,
      customerService,
      callQueueService,
      telephonyConfigService,
      providerFactory,
    );

    workspaceId = randomUUID();
    const slug = `telephony-svc-it-${Date.now()}`;
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'Telephony Service IT Workspace', ${slug}, now(), now())
    `;

    const customer = await customerService.createCustomer(workspaceId, {
      name: "IT Customer",
      phone: "+14155559000",
    });
    customerId = customer.id;

    const order = await orderService.createOrder({
      workspaceId,
      customerId,
      marketplace: "MANUAL" as never,
      paymentType: "COD" as never,
      totalAmount: 100,
    });
    orderId = order.id;

    const queueItem = await callQueueService.enqueue(orderId);
    queueId = queueItem.id;

    await telephonyConfigService.upsertConfig(workspaceId, {
      provider: "PLIVO" as never,
      authId: "AC_it_test",
      authToken: "it-test-auth-token",
      phoneNumber: "+14155550000",
    });
  });

  afterAll(async () => {
    await prisma.call.deleteMany({ where: { workspaceId } });
    await prisma.telephonyConfig.deleteMany({ where: { workspaceId } });
    await prisma.callQueue.deleteMany({ where: { orderId } });
    await prisma.$executeRaw`DELETE FROM "Order" WHERE id = ${orderId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "Customer" WHERE id = ${customerId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${workspaceId}::uuid`;
    await prisma.$disconnect();
  });

  it("createCall() persists an INITIATED Call row scoped to the workspace", async () => {
    const result = await service.createCall(workspaceId, {
      queueId,
      customerId,
    });

    expect(result.status).toBe("INITIATED");

    const call = await prisma.call.findUniqueOrThrow({
      where: { id: result.callId },
    });
    expect(call.workspaceId).toBe(workspaceId);
    expect(call.orderId).toBe(orderId);
    expect(call.customerId).toBe(customerId);
    expect(call.callQueueId).toBe(queueId);
    expect(call.provider).toBe("PLIVO");
    expect(call.phoneNumber).toBe("+14155559000");
  });

  it("createCall() fast-tracks the CallQueue row to QUEUED with scheduledAt=now", async () => {
    await prisma.callQueue.update({
      where: { id: queueId },
      data: { status: QueueStatus.FAILED, scheduledAt: null },
    });

    await service.createCall(workspaceId, { queueId, customerId });

    const queueRow = await prisma.callQueue.findUniqueOrThrow({
      where: { id: queueId },
    });
    expect(queueRow.status).toBe(QueueStatus.QUEUED);
    expect(queueRow.scheduledAt).not.toBeNull();
  });

  it("createCall() rejects a customerId that does not belong to the workspace", async () => {
    const otherWorkspaceId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${otherWorkspaceId}::uuid, 'Other IT Workspace', ${`other-it-${Date.now()}`}, now(), now())
    `;

    await expect(
      service.createCall(otherWorkspaceId, { queueId, customerId }),
    ).rejects.toThrow(BadRequestException);

    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${otherWorkspaceId}::uuid`;
  });

  it("getCallById() returns null-safe 404 semantics for a call outside the workspace", async () => {
    const created = await service.createCall(workspaceId, {
      queueId,
      customerId,
    });

    await expect(
      service.getCallById(randomUUID(), created.callId),
    ).rejects.toThrow();
  });

  it("throws TelephonyConfigMissingError when the workspace has no telephony config", async () => {
    const bareWorkspaceId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${bareWorkspaceId}::uuid, 'Bare IT Workspace', ${`bare-it-${Date.now()}`}, now(), now())
    `;
    const workspaceService = new WorkspaceService(prisma);
    const customerService = new CustomerService(prisma, workspaceService);
    const bareCustomer = await customerService.createCustomer(bareWorkspaceId, {
      name: "Bare Customer",
      phone: "+14155559999",
    });
    const orderService = new OrderService(prisma, customerService);
    const bareOrder = await orderService.createOrder({
      workspaceId: bareWorkspaceId,
      customerId: bareCustomer.id,
      marketplace: "MANUAL" as never,
      paymentType: "COD" as never,
      totalAmount: 50,
    });
    const callQueueService = new CallQueueService(prisma);
    const bareQueue = await callQueueService.enqueue(bareOrder.id);

    await expect(
      service.createCall(bareWorkspaceId, {
        queueId: bareQueue.id,
        customerId: bareCustomer.id,
      }),
    ).rejects.toThrow(TelephonyConfigMissingError);

    await prisma.callQueue.deleteMany({ where: { orderId: bareOrder.id } });
    await prisma.$executeRaw`DELETE FROM "Order" WHERE id = ${bareOrder.id}::uuid`;
    await prisma.$executeRaw`DELETE FROM "Customer" WHERE id = ${bareCustomer.id}::uuid`;
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${bareWorkspaceId}::uuid`;
  });
});
