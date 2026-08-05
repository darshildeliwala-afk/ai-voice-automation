import { ConversationService } from "./conversation.service";

const WORKSPACE_ID = "workspace-1";
const CONVERSATION_ID = "conv-1";

function setup() {
  const conversation = { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() };
  const conversationMessage = { findMany: jest.fn().mockResolvedValue([]) };
  const aIUsage = { findMany: jest.fn().mockResolvedValue([]) };
  const prisma = { conversation, conversationMessage, aIUsage };
  const workspaceService = {
    getWorkspaceById: jest.fn().mockResolvedValue({ id: WORKSPACE_ID }),
  };

  const service = new ConversationService(prisma as never, workspaceService as never);

  return { service, prisma, conversation, conversationMessage, aIUsage, workspaceService };
}

describe("ConversationService", () => {
  describe("listConversations", () => {
    it("validates the workspace and scopes to it, optionally by customerId", async () => {
      const { service, prisma, workspaceService } = setup();
      prisma.conversation.findMany.mockResolvedValue([]);
      prisma.conversation.count.mockResolvedValue(0);

      await service.listConversations(WORKSPACE_ID, { page: 1, limit: 20 }, "customer-1");

      expect(workspaceService.getWorkspaceById).toHaveBeenCalledWith(WORKSPACE_ID);
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: WORKSPACE_ID, customerId: "customer-1" },
        }),
      );
    });
  });

  describe("getConversationDetail", () => {
    it("throws NotFoundException when the conversation does not exist", async () => {
      const { service, conversation } = setup();
      conversation.findFirst.mockResolvedValue(null);

      await expect(service.getConversationDetail("missing")).rejects.toThrow();
    });

    it("returns messages ordered ascending and the conversation's summary", async () => {
      const { service, conversation, conversationMessage } = setup();
      conversation.findFirst.mockResolvedValue({
        id: CONVERSATION_ID,
        customerId: "customer-1",
        orderId: null,
        aiAgentId: null,
        callId: null,
        status: "ACTIVE",
        language: "hi-en",
        sentiment: "POSITIVE",
        createdAt: new Date("2026-08-01T00:00:00Z"),
        updatedAt: new Date("2026-08-01T00:05:00Z"),
        summary: { reason: "Late delivery" },
      });
      conversationMessage.findMany.mockResolvedValue([
        {
          id: "msg-1",
          role: "USER",
          content: "Where's my order?",
          metadata: null,
          createdAt: new Date("2026-08-01T00:00:00Z"),
        },
        {
          id: "msg-2",
          role: "ASSISTANT",
          content: "Let me check.",
          metadata: null,
          createdAt: new Date("2026-08-01T00:00:05Z"),
        },
      ]);

      const result = await service.getConversationDetail(CONVERSATION_ID);

      expect(conversationMessage.findMany).toHaveBeenCalledWith({
        where: { conversationId: CONVERSATION_ID },
        orderBy: { createdAt: "asc" },
      });
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toBe("Where's my order?");
      expect(result.summary).toEqual({ reason: "Late delivery" });
    });

    it("joins TOOL_CALL messages to their TOOL_RESULT via toolCallId, including multiple calls in one TOOL_CALL message", async () => {
      const { service, conversation, conversationMessage } = setup();
      conversation.findFirst.mockResolvedValue({
        id: CONVERSATION_ID,
        customerId: "customer-1",
        orderId: null,
        aiAgentId: null,
        callId: null,
        status: "ACTIVE",
        language: null,
        sentiment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        summary: null,
      });
      conversationMessage.findMany.mockResolvedValue([
        {
          id: "msg-1",
          role: "TOOL_CALL",
          content: "",
          metadata: {
            toolCalls: [
              { id: "call-1", name: "lookup_order", arguments: { orderId: "o1" } },
              { id: "call-2", name: "lookup_customer", arguments: {} },
            ],
          },
          createdAt: new Date("2026-08-01T00:00:00Z"),
        },
        {
          id: "msg-2",
          role: "TOOL_RESULT",
          content: '{"status":"SHIPPED"}',
          metadata: { toolCallId: "call-1", toolName: "lookup_order" },
          createdAt: new Date("2026-08-01T00:00:01Z"),
        },
        {
          id: "msg-3",
          role: "TOOL_RESULT",
          content: '{"name":"Jane"}',
          metadata: { toolCallId: "call-2", toolName: "lookup_customer" },
          createdAt: new Date("2026-08-01T00:00:02Z"),
        },
      ]);

      const result = await service.getConversationDetail(CONVERSATION_ID);

      expect(result.toolCalls).toEqual([
        {
          toolName: "lookup_order",
          input: { orderId: "o1" },
          output: { status: "SHIPPED" },
          createdAt: "2026-08-01T00:00:00.000Z",
        },
        {
          toolName: "lookup_customer",
          input: {},
          output: { name: "Jane" },
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ]);
    });

    it("returns null output for a tool call with no matching TOOL_RESULT yet", async () => {
      const { service, conversation, conversationMessage } = setup();
      conversation.findFirst.mockResolvedValue({
        id: CONVERSATION_ID,
        customerId: "customer-1",
        orderId: null,
        aiAgentId: null,
        callId: null,
        status: "ACTIVE",
        language: null,
        sentiment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        summary: null,
      });
      conversationMessage.findMany.mockResolvedValue([
        {
          id: "msg-1",
          role: "TOOL_CALL",
          content: "",
          metadata: { toolCalls: [{ id: "call-1", name: "end_call", arguments: {} }] },
          createdAt: new Date(),
        },
      ]);

      const result = await service.getConversationDetail(CONVERSATION_ID);

      expect(result.toolCalls).toEqual([
        { toolName: "end_call", input: {}, output: null, createdAt: expect.any(String) },
      ]);
    });

    it("aggregates usage totals and average latency from AIUsage records", async () => {
      const { service, conversation, aIUsage } = setup();
      conversation.findFirst.mockResolvedValue({
        id: CONVERSATION_ID,
        customerId: "customer-1",
        orderId: null,
        aiAgentId: null,
        callId: null,
        status: "ACTIVE",
        language: null,
        sentiment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        summary: null,
      });
      aIUsage.findMany.mockResolvedValue([
        { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCost: 0.001, latencyMs: 400 },
        { promptTokens: 20, completionTokens: 10, totalTokens: 30, estimatedCost: 0.002, latencyMs: 600 },
        { promptTokens: 5, completionTokens: 2, totalTokens: 7, estimatedCost: 0.0005, latencyMs: null },
      ]);

      const result = await service.getConversationDetail(CONVERSATION_ID);

      expect(result.usage).toEqual({
        promptTokens: 35,
        completionTokens: 17,
        totalTokens: 52,
        estimatedCost: 0.0035,
        avgLatencyMs: 500,
      });
    });

    it("returns avgLatencyMs null when no usage records have a latency", async () => {
      const { service, conversation, aIUsage } = setup();
      conversation.findFirst.mockResolvedValue({
        id: CONVERSATION_ID,
        customerId: "customer-1",
        orderId: null,
        aiAgentId: null,
        callId: null,
        status: "ACTIVE",
        language: null,
        sentiment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        summary: null,
      });
      aIUsage.findMany.mockResolvedValue([]);

      const result = await service.getConversationDetail(CONVERSATION_ID);

      expect(result.usage.avgLatencyMs).toBeNull();
    });
  });
});
