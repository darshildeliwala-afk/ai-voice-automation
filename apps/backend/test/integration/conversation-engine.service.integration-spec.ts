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
import { AIProviderFactory } from "../../src/ai/providers/ai-provider.factory";
// eslint-disable-next-line import/first
import { PromptBuilderService } from "../../src/ai/prompt/prompt-builder.service";
// eslint-disable-next-line import/first
import { CallQueueService } from "../../src/call-queue/call-queue.service";
// eslint-disable-next-line import/first
import { EncryptionService } from "../../src/common/encryption/encryption.service";
// eslint-disable-next-line import/first
import { PrismaService } from "../../src/common/prisma/prisma.service";
// eslint-disable-next-line import/first
import { ConversationEngineService } from "../../src/conversation-engine/conversation-engine.service";
// eslint-disable-next-line import/first
import { AIToolExecutor } from "../../src/conversation-engine/tools/ai-tool-executor";
// eslint-disable-next-line import/first
import { AIToolRegistry } from "../../src/conversation-engine/tools/ai-tool-registry";
// eslint-disable-next-line import/first
import { CreateCallbackTool } from "../../src/conversation-engine/tools/create-callback.tool";
// eslint-disable-next-line import/first
import { EndCallTool } from "../../src/conversation-engine/tools/end-call.tool";
// eslint-disable-next-line import/first
import { LookupCustomerTool } from "../../src/conversation-engine/tools/lookup-customer.tool";
// eslint-disable-next-line import/first
import { LookupOrderTool } from "../../src/conversation-engine/tools/lookup-order.tool";
// eslint-disable-next-line import/first
import { SearchKnowledgeBaseTool } from "../../src/conversation-engine/tools/search-knowledge-base.tool";
// eslint-disable-next-line import/first
import { TransferToHumanTool } from "../../src/conversation-engine/tools/transfer-to-human.tool";
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

function openAiResponse(
  overrides: Partial<{
    content: string;
    toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
    promptTokens: number;
    completionTokens: number;
  }> = {},
) {
  return {
    model: "gpt-4o-mini",
    choices: [
      {
        message: {
          content: overrides.content ?? "",
          tool_calls: overrides.toolCalls?.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          })),
        },
      },
    ],
    usage: {
      prompt_tokens: overrides.promptTokens ?? 10,
      completion_tokens: overrides.completionTokens ?? 5,
      total_tokens: (overrides.promptTokens ?? 10) + (overrides.completionTokens ?? 5),
    },
  };
}

describe("ConversationEngineService (integration, real Postgres)", () => {
  let prisma: PrismaService;
  let service: ConversationEngineService;
  let workspaceId: string;
  let customerId: string;
  let orderId: string;
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
    const callQueueService = new CallQueueService(prisma);

    const toolRegistry = new AIToolRegistry([
      new LookupCustomerTool(customerService),
      new LookupOrderTool(orderService),
      new SearchKnowledgeBaseTool(knowledgeBaseService),
      new EndCallTool(prisma),
      new TransferToHumanTool(),
      new CreateCallbackTool(callQueueService),
    ]);
    const toolExecutor = new AIToolExecutor(toolRegistry);

    service = new ConversationEngineService(
      prisma,
      workspaceService,
      customerService,
      orderService,
      aiAgentService,
      providerFactory,
      promptBuilder,
      aiProviderConfigService,
      toolRegistry,
      toolExecutor,
    );

    workspaceId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'Conversation Engine IT Workspace', ${`ce-it-${Date.now()}`}, now(), now())
    `;

    const customer = await customerService.createCustomer(workspaceId, {
      name: "IT Customer",
      phone: "+14155580199",
    });
    customerId = customer.id;

    const order = await orderService.createOrder({
      workspaceId,
      customerId,
      marketplace: "MANUAL" as never,
      paymentType: "COD" as never,
      totalAmount: 400,
      items: [{ name: "Gadget", quantity: 1, unitPrice: 400 }],
    });
    orderId = order.id;

    const aiAgent = await aiAgentService.createAiAgent({
      workspaceId,
      name: "IT Conversation Agent",
      provider: "openai",
      model: "gpt-4o-mini",
      voice: "alloy",
      language: "en",
      systemPrompt: "Be extremely concise.",
    } as never);
    aiAgentId = aiAgent.id;

    await aiProviderConfigService.upsertConfig(workspaceId, {
      provider: "OPENAI" as never,
      apiKey: "sk-it-test-key",
      defaultModel: "gpt-4o-mini",
      temperature: 0.5,
    });
  });

  beforeEach(() => {
    mockCreate.mockReset();
  });

  afterAll(async () => {
    await prisma.callQueue.deleteMany({ where: { order: { workspaceId } } });
    await prisma.aIUsage.deleteMany({ where: { workspaceId } });
    await prisma.conversationMessage.deleteMany({
      where: { conversation: { workspaceId } },
    });
    await prisma.conversation.deleteMany({ where: { workspaceId } });
    await prisma.aiProviderConfig.deleteMany({ where: { workspaceId } });
    await prisma.aiAgent.deleteMany({ where: { workspaceId } });
    await prisma.orderItem.deleteMany({ where: { order: { workspaceId } } });
    await prisma.order.deleteMany({ where: { workspaceId } });
    await prisma.customer.deleteMany({ where: { workspaceId } });
    await prisma.workspaceSettings.deleteMany({ where: { workspaceId } });
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${workspaceId}::uuid`;
    await prisma.$disconnect();
  });

  it("processes a plain turn: persists conversation, USER + ASSISTANT messages, and one AIUsage row", async () => {
    mockCreate.mockResolvedValueOnce(
      openAiResponse({ content: "Hi, this is Acme calling!" }),
    );

    const result = await service.processMessage({
      workspaceId,
      customerId,
      orderId,
      aiAgentId,
      message: "Hello?",
    });

    expect(result.content).toBe("Hi, this is Acme calling!");
    expect(result.toolCallsExecuted).toEqual([]);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: result.conversationId },
      orderBy: { createdAt: "asc" },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "USER", content: "Hello?" });
    expect(messages[1]).toMatchObject({
      role: "ASSISTANT",
      content: "Hi, this is Acme calling!",
    });

    const usageRows = await prisma.aIUsage.findMany({
      where: { conversationId: result.conversationId },
    });
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("runs the full tool-calling loop against a real DB: lookup_order then a final reply", async () => {
    mockCreate
      .mockResolvedValueOnce(
        openAiResponse({
          toolCalls: [{ id: "call_1", name: "lookup_order", args: {} }],
          promptTokens: 30,
          completionTokens: 6,
        }),
      )
      .mockResolvedValueOnce(
        openAiResponse({
          content: "Your Gadget order for $400 is on its way.",
          promptTokens: 45,
          completionTokens: 12,
        }),
      );

    const result = await service.processMessage({
      workspaceId,
      customerId,
      orderId,
      aiAgentId,
      message: "What's the status of my order?",
    });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.content).toBe("Your Gadget order for $400 is on its way.");
    expect(result.toolCallsExecuted).toEqual(["lookup_order"]);
    expect(result.promptTokens).toBe(75);
    expect(result.completionTokens).toBe(18);

    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: result.conversationId },
      orderBy: { createdAt: "asc" },
    });
    const roles = messages.map((message) => message.role);
    expect(roles).toEqual(["USER", "TOOL_CALL", "TOOL_RESULT", "ASSISTANT"]);

    const toolCallMessage = messages[1];
    expect(toolCallMessage.metadata).toMatchObject({
      toolCalls: [{ id: "call_1", name: "lookup_order", arguments: {} }],
    });

    const toolResultMessage = messages[2];
    expect(toolResultMessage.metadata).toMatchObject({
      toolCallId: "call_1",
      toolName: "lookup_order",
    });
    const toolResultPayload = JSON.parse(toolResultMessage.content) as {
      id: string;
      totalAmount: number;
    };
    expect(toolResultPayload.id).toBe(orderId);

    const usageRows = await prisma.aIUsage.findMany({
      where: { conversationId: result.conversationId },
      orderBy: { createdAt: "asc" },
    });
    expect(usageRows).toHaveLength(2);
    expect(usageRows[0].promptTokens).toBe(30);
    expect(usageRows[1].promptTokens).toBe(45);
  });

  it("stops the loop on a terminal tool result (end_call) and marks the conversation COMPLETED", async () => {
    mockCreate.mockResolvedValueOnce(
      openAiResponse({
        content: "Glad I could help, goodbye!",
        toolCalls: [{ id: "call_1", name: "end_call", args: { reason: "resolved" } }],
      }),
    );

    const result = await service.processMessage({
      workspaceId,
      customerId,
      orderId,
      aiAgentId,
      message: "That's all, thanks!",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.toolCallsExecuted).toEqual(["end_call"]);

    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: result.conversationId },
    });
    expect(conversation.status).toBe("COMPLETED");
  });

  it("create_callback tool schedules a real CallQueue row via CallQueueService", async () => {
    const scheduledIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockCreate
      .mockResolvedValueOnce(
        openAiResponse({
          toolCalls: [
            {
              id: "call_1",
              name: "create_callback",
              args: { scheduledAt: scheduledIso },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        openAiResponse({ content: "I've scheduled a callback for you." }),
      );

    const result = await service.processMessage({
      workspaceId,
      customerId,
      orderId,
      aiAgentId,
      message: "Can you call me back in an hour?",
    });

    expect(result.toolCallsExecuted).toEqual(["create_callback"]);

    const queueItems = await prisma.callQueue.findMany({ where: { orderId } });
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0].scheduledAt?.toISOString()).toBe(scheduledIso);
  });
});
