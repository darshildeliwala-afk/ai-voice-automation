import { randomUUID } from "node:crypto";

const mockCreate = jest.fn();

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
import { AiAgentService } from "../../src/ai-agent/ai-agent.service";
// eslint-disable-next-line import/first
import { AIService } from "../../src/ai/ai.service";
// eslint-disable-next-line import/first
import { AIProviderFactory } from "../../src/ai/providers/ai-provider.factory";
// eslint-disable-next-line import/first
import { PromptBuilderService } from "../../src/ai/prompt/prompt-builder.service";
// eslint-disable-next-line import/first
import { EncryptionService } from "../../src/common/encryption/encryption.service";
// eslint-disable-next-line import/first
import { PrismaService } from "../../src/common/prisma/prisma.service";
// eslint-disable-next-line import/first
import { CustomerService } from "../../src/customer/customer.service";
// eslint-disable-next-line import/first
import { KnowledgeBaseService } from "../../src/knowledge-base/knowledge-base.service";
// eslint-disable-next-line import/first
import { OrderService } from "../../src/order/order.service";
// eslint-disable-next-line import/first
import { AiProviderConfigService } from "../../src/workspace-settings/ai-provider-config.service";
// eslint-disable-next-line import/first
import { WorkspaceSettingsService } from "../../src/workspace-settings/workspace-settings.service";
// eslint-disable-next-line import/first
import { WorkspaceService } from "../../src/workspace/workspace.service";

describe("AIService (integration, real Postgres)", () => {
  let prisma: PrismaService;
  let service: AIService;
  let workspaceId: string;
  let customerId: string;
  let orderId: string;
  let knowledgeBaseId: string;
  let aiAgentId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const workspaceService = new WorkspaceService(prisma);
    const customerService = new CustomerService(prisma, workspaceService);
    const orderService = new OrderService(prisma, customerService);
    const aiAgentService = new AiAgentService(prisma, workspaceService);
    const knowledgeBaseService = new KnowledgeBaseService(prisma, workspaceService);
    const encryptionService = new EncryptionService();
    const workspaceSettingsService = new WorkspaceSettingsService(
      prisma,
      workspaceService,
    );
    const aiProviderConfigService = new AiProviderConfigService(
      prisma,
      workspaceService,
      encryptionService,
    );
    const providerFactory = new AIProviderFactory(aiProviderConfigService);
    const promptBuilder = new PromptBuilderService(
      prisma,
      workspaceSettingsService,
      aiAgentService,
      knowledgeBaseService,
      customerService,
      orderService,
    );

    service = new AIService(
      prisma,
      providerFactory,
      promptBuilder,
      aiProviderConfigService,
    );

    workspaceId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'AI Service IT Workspace', ${`ai-service-it-${Date.now()}`}, now(), now())
    `;

    const customer = await customerService.createCustomer(workspaceId, {
      name: "IT Customer",
      phone: "+14155580100",
    });
    customerId = customer.id;

    const order = await orderService.createOrder({
      workspaceId,
      customerId,
      marketplace: "MANUAL" as never,
      paymentType: "COD" as never,
      totalAmount: 250,
      items: [{ name: "Widget", quantity: 2, unitPrice: 100 }],
    });
    orderId = order.id;

    const knowledgeBase = await knowledgeBaseService.createKnowledgeBase({
      workspaceId,
      title: "Return Policy",
      content: "Returns are accepted within 30 days of delivery.",
    });
    knowledgeBaseId = knowledgeBase.id;

    const aiAgent = await aiAgentService.createAiAgent({
      workspaceId,
      name: "IT Support Agent",
      provider: "openai",
      model: "gpt-4o-mini",
      voice: "alloy",
      language: "en",
      systemPrompt: "Be extremely concise.",
      knowledgeBaseId,
    } as never);
    aiAgentId = aiAgent.id;

    const encryptedKeyRow = await aiProviderConfigService.upsertConfig(
      workspaceId,
      {
        provider: "OPENAI" as never,
        apiKey: "sk-it-test-key",
        defaultModel: "gpt-4o-mini",
        temperature: 0.5,
      },
    );
    void encryptedKeyRow;
  });

  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      model: "gpt-4o-mini",
      choices: [{ message: { content: "Sure, I can help with that." } }],
      usage: { prompt_tokens: 42, completion_tokens: 18, total_tokens: 60 },
    });
  });

  afterAll(async () => {
    await prisma.aIUsage.deleteMany({ where: { workspaceId } });
    await prisma.conversationMessage.deleteMany({
      where: { conversation: { workspaceId } },
    });
    await prisma.conversation.deleteMany({ where: { workspaceId } });
    await prisma.aiProviderConfig.deleteMany({ where: { workspaceId } });
    await prisma.aiAgent.deleteMany({ where: { workspaceId } });
    await prisma.knowledgeBase.deleteMany({ where: { workspaceId } });
    await prisma.orderItem.deleteMany({ where: { order: { workspaceId } } });
    await prisma.order.deleteMany({ where: { workspaceId } });
    await prisma.customer.deleteMany({ where: { workspaceId } });
    await prisma.workspaceSettings.deleteMany({ where: { workspaceId } });
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${workspaceId}::uuid`;
    await prisma.$disconnect();
  });

  it("creates a new conversation, persists messages, and persists a usage record with real DB rows", async () => {
    const result = await service.sendMessage({
      workspaceId,
      customerId,
      orderId,
      aiAgentId,
      message: "What's the status of my order?",
    });

    expect(result.content).toBe("Sure, I can help with that.");
    expect(result.provider).toBe("OPENAI");
    expect(result.estimatedCost).toBeGreaterThan(0);

    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: result.conversationId },
    });
    expect(conversation.workspaceId).toBe(workspaceId);
    expect(conversation.customerId).toBe(customerId);
    expect(conversation.orderId).toBe(orderId);
    expect(conversation.aiAgentId).toBe(aiAgentId);

    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: result.conversationId },
      orderBy: { createdAt: "asc" },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "USER",
      content: "What's the status of my order?",
    });
    expect(messages[1]).toMatchObject({
      role: "ASSISTANT",
      content: "Sure, I can help with that.",
    });

    const usage = await prisma.aIUsage.findFirst({
      where: { conversationId: result.conversationId },
    });
    expect(usage).not.toBeNull();
    expect(usage?.promptTokens).toBe(42);
    expect(usage?.completionTokens).toBe(18);
    expect(usage?.totalTokens).toBe(60);
    expect(Number(usage?.estimatedCost)).toBeGreaterThan(0);
  });

  it("assembles the prompt from real workspace/agent/knowledge-base/customer/order data", async () => {
    await service.sendMessage({
      workspaceId,
      customerId,
      orderId,
      aiAgentId,
      message: "Tell me about returns",
    });

    const requestArgs = mockCreate.mock.calls.at(-1)?.[0];
    const systemMessage = requestArgs.messages.find(
      (message: { role: string }) => message.role === "system",
    );

    expect(systemMessage.content).toContain("# Workspace");
    expect(systemMessage.content).toContain("IT Support Agent");
    expect(systemMessage.content).toContain("Returns are accepted within 30 days");
    expect(systemMessage.content).toContain("IT Customer");
    expect(systemMessage.content).toContain("Widget x2");
  });

  it("continues an existing conversation across two turns, growing the history sent to the provider", async () => {
    const first = await service.sendMessage({
      workspaceId,
      customerId,
      message: "First message",
    });

    mockCreate.mockResolvedValueOnce({
      model: "gpt-4o-mini",
      choices: [{ message: { content: "Second reply" } }],
      usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
    });

    await service.sendMessage({
      workspaceId,
      customerId,
      message: "Second message",
      conversationId: first.conversationId,
    });

    const secondRequest = mockCreate.mock.calls.at(-1)?.[0];
    const roles = secondRequest.messages.map((m: { role: string }) => m.role);
    // system, prior user, prior assistant, new user
    expect(roles).toEqual(["system", "user", "assistant", "user"]);

    const allMessages = await prisma.conversationMessage.findMany({
      where: { conversationId: first.conversationId },
      orderBy: { createdAt: "asc" },
    });
    expect(allMessages).toHaveLength(4);

    const usageRecords = await prisma.aIUsage.findMany({
      where: { conversationId: first.conversationId },
    });
    expect(usageRecords).toHaveLength(2);
  });

  it("rejects a conversationId belonging to a different workspace", async () => {
    const otherWorkspaceId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${otherWorkspaceId}::uuid, 'Other IT Workspace', ${`ai-other-it-${Date.now()}`}, now(), now())
    `;

    const first = await service.sendMessage({
      workspaceId,
      customerId,
      message: "Hello",
    });

    await expect(
      service.sendMessage({
        workspaceId: otherWorkspaceId,
        customerId,
        message: "Hijack attempt",
        conversationId: first.conversationId,
      }),
    ).rejects.toThrow();

    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${otherWorkspaceId}::uuid`;
  });
});
