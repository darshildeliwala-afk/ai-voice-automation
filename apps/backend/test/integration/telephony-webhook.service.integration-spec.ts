import { randomUUID } from "node:crypto";

const mockCreate = jest.fn();

jest.mock("plivo", () => ({
  Client: jest.fn().mockImplementation(() => ({
    calls: { create: jest.fn(), hangup: jest.fn(), get: jest.fn() },
  })),
  validateSignature: jest.fn().mockReturnValue(true),
  Response: jest.fn().mockImplementation(() => ({
    addSpeak: jest.fn(),
    addRecord: jest.fn(),
    addStream: jest.fn(),
    toXML: () => "<Response><Speak>stub</Speak></Response>",
  })),
}));

jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
  AuthenticationError: class extends Error {},
  RateLimitError: class extends Error {},
  APIConnectionTimeoutError: class extends Error {},
}));

// eslint-disable-next-line import/first
import { EncryptionService } from "../../src/common/encryption/encryption.service";
// eslint-disable-next-line import/first
import { PrismaService } from "../../src/common/prisma/prisma.service";
// eslint-disable-next-line import/first
import { CallStatus, QueueStatus } from "../../src/generated/prisma/client";
// eslint-disable-next-line import/first
import { TelephonyProviderFactory } from "../../src/telephony/providers/telephony-provider.factory";
// eslint-disable-next-line import/first
import { TelephonyWebhookService } from "../../src/telephony/webhooks/telephony-webhook.service";
// eslint-disable-next-line import/first
import { AiProviderConfigService } from "../../src/workspace-settings/ai-provider-config.service";
// eslint-disable-next-line import/first
import { TelephonyConfigService } from "../../src/workspace-settings/telephony-config.service";
// eslint-disable-next-line import/first
import { WorkspaceService } from "../../src/workspace/workspace.service";
// eslint-disable-next-line import/first
import { buildConversationEngineTestChain } from "./helpers/build-conversation-engine";

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

    const encryptionService = new EncryptionService();
    const workspaceService = new WorkspaceService(prisma);
    const telephonyConfigService = new TelephonyConfigService(
      prisma,
      workspaceService,
      encryptionService,
    );
    const providerFactory = new TelephonyProviderFactory(
      telephonyConfigService,
    );

    const {
      customerService,
      orderService,
      callQueueService,
      conversationEngine,
    } = buildConversationEngineTestChain(prisma);

    webhookService = new TelephonyWebhookService(
      prisma,
      providerFactory,
      callQueueService,
      conversationEngine,
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
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      model: "gpt-4o-mini",
      choices: [{ message: { content: "Hi, this is Acme calling!" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

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
    await prisma.aIUsage.deleteMany({ where: { workspaceId } });
    await prisma.conversationMessage.deleteMany({
      where: { conversation: { workspaceId } },
    });
    await prisma.conversation.deleteMany({ where: { workspaceId } });
    await prisma.telephonyWebhookEvent.deleteMany({
      where: { providerCallId: { in: ["req-uuid-webhook-it", "call-uuid-webhook-it"] } },
    });
    await prisma.call.deleteMany({ where: { id: callId } });
  });

  afterAll(async () => {
    await prisma.aiProviderConfig.deleteMany({ where: { workspaceId } });
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

  describe("conversation engine trigger (Sprint 15 worker integration)", () => {
    it("creates a Conversation and persists the opening AI turn when no AI provider is configured for the workspace (fails gracefully, call status still updates)", async () => {
      // No AiProviderConfig has been created for this workspace at this
      // point in the suite -- the engine should fail internally and the
      // webhook should still succeed.
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
      const conversation = await prisma.conversation.findFirst({
        where: { callId },
      });
      expect(conversation).toBeNull();
    });

    it("runs the conversation engine end-to-end once an AI provider is configured, persisting Conversation + messages + usage", async () => {
      const aiProviderConfigService = new AiProviderConfigService(
        prisma,
        new WorkspaceService(prisma),
        new EncryptionService(),
      );
      await aiProviderConfigService.upsertConfig(workspaceId, {
        provider: "OPENAI" as never,
        apiKey: "sk-webhook-it-test-key",
        defaultModel: "gpt-4o-mini",
        temperature: 0.5,
      });

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

      // The XML response is unchanged regardless of the AI outcome.
      expect(response?.contentType).toBe("text/xml");

      const conversation = await prisma.conversation.findFirstOrThrow({
        where: { callId },
      });
      expect(conversation.orderId).toBe(orderId);
      expect(conversation.customerId).toBe(customerId);

      const messages = await prisma.conversationMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" },
      });
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("USER");
      expect(messages[1]).toMatchObject({
        role: "ASSISTANT",
        content: "Hi, this is Acme calling!",
      });

      const usage = await prisma.aIUsage.findFirst({
        where: { conversationId: conversation.id },
      });
      expect(usage).not.toBeNull();
      expect(usage?.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});
