import { randomUUID } from "node:crypto";

jest.mock("plivo", () => ({
  Client: jest.fn().mockImplementation(() => ({
    calls: { create: jest.fn(), hangup: jest.fn(), get: jest.fn() },
  })),
  validateSignature: jest.fn().mockReturnValue(true),
  Response: jest.fn().mockImplementation(() => ({
    addSpeak: jest.fn(),
    addRecord: jest.fn(),
    toXML: () => "<Response><Speak>stub</Speak></Response>",
  })),
}));

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
import { CallStatus, QueueStatus } from "../../src/generated/prisma/client";
// eslint-disable-next-line import/first
import { TelephonyProviderFactory } from "../../src/telephony/providers/telephony-provider.factory";
// eslint-disable-next-line import/first
import { TelephonyWebhookService } from "../../src/telephony/webhooks/telephony-webhook.service";
// eslint-disable-next-line import/first
import { TelephonyConfigService } from "../../src/workspace-settings/telephony-config.service";
// eslint-disable-next-line import/first
import { WorkspaceService } from "../../src/workspace/workspace.service";

describe("TelephonyWebhookService (integration, real Postgres)", () => {
  let prisma: PrismaService;
  let webhookService: TelephonyWebhookService;
  let workspaceId: string;
  let customerId: string;
  let orderId: string;
  let queueId: string;
  let callId: string;

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

    webhookService = new TelephonyWebhookService(
      prisma,
      providerFactory,
      callQueueService,
    );

    workspaceId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'Webhook IT Workspace', ${`webhook-it-${Date.now()}`}, now(), now())
    `;

    const customer = await customerService.createCustomer(workspaceId, {
      name: "Webhook IT Customer",
      phone: "+14155559100",
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
    await prisma.callQueue.update({
      where: { id: queueId },
      data: { status: QueueStatus.CALLING },
    });

    await telephonyConfigService.upsertConfig(workspaceId, {
      provider: "PLIVO" as never,
      authId: "AC_webhook_it",
      authToken: "webhook-it-auth-token",
      phoneNumber: "+14155550001",
    });
  });

  beforeEach(async () => {
    const call = await prisma.call.create({
      data: {
        workspaceId,
        orderId,
        customerId,
        callQueueId: queueId,
        provider: "PLIVO",
        phoneNumber: "+14155559100",
        status: CallStatus.INITIATED,
        providerCallId: "req-uuid-webhook-it",
      },
    });
    callId = call.id;
  });

  afterEach(async () => {
    await prisma.telephonyWebhookEvent.deleteMany({
      where: { providerCallId: { in: ["req-uuid-webhook-it", "call-uuid-webhook-it"] } },
    });
    await prisma.call.deleteMany({ where: { id: callId } });
  });

  afterAll(async () => {
    await prisma.telephonyConfig.deleteMany({ where: { workspaceId } });
    await prisma.callQueue.deleteMany({ where: { orderId } });
    await prisma.$executeRaw`DELETE FROM "Order" WHERE id = ${orderId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "Customer" WHERE id = ${customerId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${workspaceId}::uuid`;
    await prisma.$disconnect();
  });

  it("processes the answer webhook: updates status, returns XML, sets answeredAt on first CONNECTED", async () => {
    const response = await webhookService.processWebhook({
      callId,
      type: "answer",
      url: "https://example.com/telephony/webhook?callId=x&type=answer",
      headers: {
        "x-plivo-signature-v2": "sig",
        "x-plivo-signature-v2-nonce": "nonce",
      },
      body: {
        CallUUID: "call-uuid-webhook-it",
        RequestUUID: "req-uuid-webhook-it",
        CallStatus: "in-progress",
      },
    });

    expect(response?.contentType).toBe("text/xml");

    const updated = await prisma.call.findUniqueOrThrow({
      where: { id: callId },
    });
    expect(updated.status).toBe(CallStatus.CONNECTED);
    expect(updated.providerCallId).toBe("call-uuid-webhook-it");
    expect(updated.answeredAt).not.toBeNull();
  });

  it("processes the hangup webhook: marks COMPLETED, persists recordingUrl + duration, completes the CallQueue row", async () => {
    await webhookService.processWebhook({
      callId,
      type: "answer",
      url: "https://example.com/telephony/webhook?callId=x&type=answer",
      headers: {
        "x-plivo-signature-v2": "sig",
        "x-plivo-signature-v2-nonce": "nonce",
      },
      body: {
        CallUUID: "call-uuid-webhook-it",
        RequestUUID: "req-uuid-webhook-it",
        CallStatus: "in-progress",
      },
    });

    const response = await webhookService.processWebhook({
      callId,
      type: "hangup",
      url: "https://example.com/telephony/webhook?callId=x&type=hangup",
      headers: {
        "x-plivo-signature-v2": "sig",
        "x-plivo-signature-v2-nonce": "nonce",
      },
      body: {
        CallUUID: "call-uuid-webhook-it",
        CallStatus: "completed",
        Duration: "37",
        RecordingUrl: "https://plivo.example/recordings/abc.mp3",
        HangupCause: "NORMAL_CLEARING",
      },
    });

    expect(response).toBeNull();

    const updated = await prisma.call.findUniqueOrThrow({
      where: { id: callId },
    });
    expect(updated.status).toBe(CallStatus.COMPLETED);
    expect(updated.durationSeconds).toBe(37);
    expect(updated.recordingUrl).toBe(
      "https://plivo.example/recordings/abc.mp3",
    );
    expect(updated.endedAt).not.toBeNull();

    const queueRow = await prisma.callQueue.findUniqueOrThrow({
      where: { id: queueId },
    });
    expect(queueRow.status).toBe(QueueStatus.COMPLETED);
  });

  it("is idempotent: a redelivered identical event is ignored (real unique constraint)", async () => {
    const webhookBody = {
      CallUUID: "call-uuid-webhook-it",
      RequestUUID: "req-uuid-webhook-it",
      CallStatus: "ringing",
    };

    await webhookService.processWebhook({
      callId,
      type: "answer",
      url: "https://example.com/telephony/webhook",
      headers: {
        "x-plivo-signature-v2": "sig",
        "x-plivo-signature-v2-nonce": "nonce",
      },
      body: webhookBody,
    });

    const afterFirst = await prisma.call.findUniqueOrThrow({
      where: { id: callId },
    });

    // Redeliver the exact same event.
    await webhookService.processWebhook({
      callId,
      type: "answer",
      url: "https://example.com/telephony/webhook",
      headers: {
        "x-plivo-signature-v2": "sig",
        "x-plivo-signature-v2-nonce": "nonce",
      },
      body: webhookBody,
    });

    const afterSecond = await prisma.call.findUniqueOrThrow({
      where: { id: callId },
    });
    expect(afterSecond.updatedAt).toEqual(afterFirst.updatedAt);

    const events = await prisma.telephonyWebhookEvent.findMany({
      where: { providerCallId: "call-uuid-webhook-it" },
    });
    expect(events).toHaveLength(1);
  });

  it("rejects an event whose CallUUID/RequestUUID does not correlate to the stored providerCallId", async () => {
    await expect(
      webhookService.processWebhook({
        callId,
        type: "hangup",
        url: "https://example.com/telephony/webhook",
        headers: {
          "x-plivo-signature-v2": "sig",
          "x-plivo-signature-v2-nonce": "nonce",
        },
        body: {
          CallUUID: "totally-unrelated-call-uuid",
          RequestUUID: "totally-unrelated-request-uuid",
          CallStatus: "completed",
        },
      }),
    ).rejects.toThrow();

    const unchanged = await prisma.call.findUniqueOrThrow({
      where: { id: callId },
    });
    expect(unchanged.status).toBe(CallStatus.INITIATED);
  });
});
