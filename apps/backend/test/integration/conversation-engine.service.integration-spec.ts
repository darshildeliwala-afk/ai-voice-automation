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
import { PrismaService } from "../../src/common/prisma/prisma.service";
// eslint-disable-next-line import/first
import { ConversationEngineService } from "../../src/conversation-engine/conversation-engine.service";
// eslint-disable-next-line import/first
import { CustomerService } from "../../src/customer/customer.service";
// eslint-disable-next-line import/first
import { WorkflowNodeType } from "../../src/generated/prisma/client";
// eslint-disable-next-line import/first
import { OrderService } from "../../src/order/order.service";
// eslint-disable-next-line import/first
import { WorkflowService } from "../../src/workflow/workflow.service";
// eslint-disable-next-line import/first
import { AiProviderConfigService } from "../../src/workspace-settings/ai-provider-config.service";
// eslint-disable-next-line import/first
import { buildConversationEngineTestChain } from "./helpers/build-conversation-engine";

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
  let workflowService: WorkflowService;
  let customerService: CustomerService;
  let orderService: OrderService;
  let aiAgentService: AiAgentService;
  let aiProviderConfigService: AiProviderConfigService;
  let workspaceId: string;
  let customerId: string;
  let orderId: string;
  let aiAgentId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const chain = buildConversationEngineTestChain(prisma);
    service = chain.conversationEngine;
    workflowService = chain.workflowService;
    customerService = chain.customerService;
    orderService = chain.orderService;
    aiAgentService = chain.aiAgentService;
    aiProviderConfigService = chain.aiProviderConfigService;

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
    await prisma.workflowNode.deleteMany({ where: { workflow: { workspaceId } } });
    await prisma.workflow.deleteMany({ where: { workspaceId } });
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
    mockCreate
      .mockResolvedValueOnce(
        openAiResponse({
          content: "Glad I could help, goodbye!",
          toolCalls: [{ id: "call_1", name: "end_call", args: { reason: "resolved" } }],
        }),
      )
      // end_call triggers Sprint 19 automatic call-summary generation, a
      // second real chat completion over the transcript.
      .mockResolvedValueOnce(
        openAiResponse({ content: JSON.stringify({ reason: "resolved", callbackRequired: false }) }),
      );

    const result = await service.processMessage({
      workspaceId,
      customerId,
      orderId,
      aiAgentId,
      message: "That's all, thanks!",
    });

    expect(mockCreate).toHaveBeenCalledTimes(2);
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

  describe("custom published Workflow (Sprint 16 workflow engine)", () => {
    // Each test binds its workflow to its own fresh AI Agent -- two
    // simultaneously-active workflows sharing one aiAgentId would make
    // resolveActiveGraph's pick between them non-deterministic.
    async function createTestAgent(name: string): Promise<string> {
      const agent = await aiAgentService.createAiAgent({
        workspaceId,
        name,
        provider: "openai",
        model: "gpt-4o-mini",
        voice: "alloy",
        language: "en",
      } as never);
      return agent.id;
    }

    it("executes PROMPT -> TOOL -> CONDITION -> HUMAN_TRANSFER for a PENDING order", async () => {
      const agentId = await createTestAgent(`Human Transfer Agent ${randomUUID()}`);
      const workflow = await workflowService.createWorkflow(workspaceId, {
        aiAgentId: agentId,
        slug: `human-transfer-flow-${randomUUID()}`,
        name: "Human transfer flow",
        entryNodeKey: "greet",
        nodes: [
          { key: "greet", type: WorkflowNodeType.PROMPT, config: { allowTools: false, next: "lookup" } },
          { key: "lookup", type: WorkflowNodeType.TOOL, config: { toolName: "lookup_order", next: "route" } },
          {
            key: "route",
            type: WorkflowNodeType.CONDITION,
            config: {
              field: "state.lookup.status",
              operator: "equals",
              value: "PENDING",
              whenTrue: "transfer",
              whenFalse: "wrap_up",
            },
          },
          {
            key: "transfer",
            type: WorkflowNodeType.HUMAN_TRANSFER,
            config: { reason: "Order still pending, needs human review" },
          },
          { key: "wrap_up", type: WorkflowNodeType.PROMPT, config: { allowTools: false } },
        ],
      });
      const published = await workflowService.publish(workspaceId, workflow.id);
      expect(published.status).toBe("PUBLISHED");
      expect(published.isActive).toBe(true);

      mockCreate.mockResolvedValueOnce(
        openAiResponse({ content: "Let me check that for you." }),
      );

      const result = await service.processMessage({
        workspaceId,
        customerId,
        orderId,
        aiAgentId: agentId,
        message: "What's happening with my order?",
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(result.content).toBe("Let me check that for you.");
      expect(result.toolCallsExecuted).toEqual(["lookup_order", "transfer_to_human"]);
      // Sprint 20 Live Call API -- lastNodeKey should be the HUMAN_TRANSFER
      // node that actually ran, not "route" (which handed off to it).
      expect(result.lastNodeKey).toBe("transfer");

      const conversation = await prisma.conversation.findUniqueOrThrow({
        where: { id: result.conversationId },
      });
      // Sprint 19's transfer_to_human tool flips the conversation to
      // WAITING_FOR_HUMAN rather than leaving it ACTIVE.
      expect(conversation.status).toBe("WAITING_FOR_HUMAN");

      const messages = await prisma.conversationMessage.findMany({
        where: { conversationId: result.conversationId },
        orderBy: { createdAt: "asc" },
      });
      expect(messages.map((m) => m.role)).toEqual([
        "USER",
        "ASSISTANT",
        "TOOL_CALL",
        "TOOL_RESULT",
        "TOOL_CALL",
        "TOOL_RESULT",
      ]);

      const usageRows = await prisma.aIUsage.findMany({
        where: { conversationId: result.conversationId },
      });
      expect(usageRows).toHaveLength(1);
    });

    it("executes PROMPT -> TOOL -> CONDITION -> END for a non-PENDING order, completing the conversation", async () => {
      const agentId = await createTestAgent(`End Flow Agent ${randomUUID()}`);
      const shippedOrder = await orderService.createOrder({
        workspaceId,
        customerId,
        marketplace: "MANUAL" as never,
        paymentType: "COD" as never,
        totalAmount: 250,
      });
      await prisma.order.update({
        where: { id: shippedOrder.id },
        data: { status: "SHIPPED" as never },
      });

      const workflow = await workflowService.createWorkflow(workspaceId, {
        aiAgentId: agentId,
        slug: `end-flow-${randomUUID()}`,
        name: "End flow",
        entryNodeKey: "greet",
        nodes: [
          { key: "greet", type: WorkflowNodeType.PROMPT, config: { allowTools: false, next: "lookup" } },
          { key: "lookup", type: WorkflowNodeType.TOOL, config: { toolName: "lookup_order", next: "route" } },
          {
            key: "route",
            type: WorkflowNodeType.CONDITION,
            config: {
              field: "state.lookup.status",
              operator: "equals",
              value: "PENDING",
              whenTrue: "transfer",
              whenFalse: "wrap_up",
            },
          },
          { key: "transfer", type: WorkflowNodeType.HUMAN_TRANSFER, config: {} },
          { key: "wrap_up", type: WorkflowNodeType.END, config: { reason: "Order already shipped" } },
        ],
      });
      await workflowService.publish(workspaceId, workflow.id);

      mockCreate.mockResolvedValueOnce(
        openAiResponse({ content: "Let me check that for you." }),
      );

      const result = await service.processMessage({
        workspaceId,
        customerId,
        orderId: shippedOrder.id,
        aiAgentId: agentId,
        message: "What's happening with my order?",
      });

      expect(result.toolCallsExecuted).toEqual(["lookup_order", "end_call"]);
      // Sprint 20 Live Call API -- lastNodeKey is the END node that
      // actually terminated the run.
      expect(result.lastNodeKey).toBe("wrap_up");

      const conversation = await prisma.conversation.findUniqueOrThrow({
        where: { id: result.conversationId },
      });
      expect(conversation.status).toBe("COMPLETED");
    });

    it("publishing a new workflow version deactivates the previously active version", async () => {
      const slug = `versioned-flow-${randomUUID()}`;
      const v1 = await workflowService.createWorkflow(workspaceId, {
        slug,
        name: "Versioned flow",
        entryNodeKey: "end",
        nodes: [{ key: "end", type: WorkflowNodeType.END, config: {} }],
      });
      await workflowService.publish(workspaceId, v1.id);

      const v2 = await workflowService.createNewVersion(workspaceId, v1.id);
      expect(v2.version).toBe(2);
      await workflowService.publish(workspaceId, v2.id);

      const versions = await workflowService.listVersions(workspaceId, slug);
      const v1Reloaded = versions.find((v) => v.id === v1.id);
      const v2Reloaded = versions.find((v) => v.id === v2.id);
      expect(v1Reloaded?.isActive).toBe(false);
      expect(v2Reloaded?.isActive).toBe(true);
    });
  });
});
