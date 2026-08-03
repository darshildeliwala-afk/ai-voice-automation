import { NotFoundException } from "@nestjs/common";

import { ConversationEngineService } from "./conversation-engine.service";

const WORKSPACE_ID = "workspace-1";
const CUSTOMER_ID = "customer-1";

function setup() {
  const conversation = { create: jest.fn(), findFirst: jest.fn() };
  const conversationMessage = { create: jest.fn() };
  const aIUsage = { create: jest.fn() };
  const prisma = { conversation, conversationMessage, aIUsage };

  const workspaceService = {
    getWorkspaceById: jest.fn().mockResolvedValue({ id: WORKSPACE_ID }),
  };
  const customerService = {
    getCustomerById: jest.fn().mockResolvedValue({ id: CUSTOMER_ID }),
  };
  const orderService = {
    getOrderById: jest.fn().mockResolvedValue({
      id: "order-1",
      workspaceId: WORKSPACE_ID,
    }),
  };
  const aiAgentService = {
    getAiAgentById: jest.fn().mockResolvedValue({
      id: "agent-1",
      workspaceId: WORKSPACE_ID,
    }),
  };

  const chat = jest.fn().mockResolvedValue({
    content: "Hello! How can I help?",
    model: "gpt-4o-mini",
    promptTokens: 20,
    completionTokens: 10,
    totalTokens: 30,
    rawResponse: {},
  });
  const providerFactory = {
    createForWorkspace: jest.fn().mockResolvedValue({ chat }),
  };

  const promptBuilder = {
    build: jest.fn().mockResolvedValue({
      systemPrompt: "system context",
      history: [],
    }),
  };

  const aiProviderConfigService = {
    getActiveConfig: jest.fn().mockResolvedValue({
      provider: "OPENAI",
      isActive: true,
    }),
  };

  const toolRegistry = {
    getToolDefinitions: jest.fn().mockReturnValue([
      { name: "lookup_order", description: "...", parameters: {} },
    ]),
  };
  const toolExecutor = {
    execute: jest.fn().mockResolvedValue({ content: '{"ok":true}' }),
  };

  const service = new ConversationEngineService(
    prisma as never,
    workspaceService as never,
    customerService as never,
    orderService as never,
    aiAgentService as never,
    providerFactory as never,
    promptBuilder as never,
    aiProviderConfigService as never,
    toolRegistry as never,
    toolExecutor as never,
  );

  return {
    service,
    prisma,
    conversation,
    conversationMessage,
    aIUsage,
    workspaceService,
    customerService,
    orderService,
    aiAgentService,
    providerFactory,
    chat,
    promptBuilder,
    aiProviderConfigService,
    toolRegistry,
    toolExecutor,
  };
}

describe("ConversationEngineService", () => {
  describe("context loading / validation", () => {
    it("validates the workspace, customer, order, and agent before doing any AI work", async () => {
      const {
        service,
        conversation,
        workspaceService,
        customerService,
        orderService,
        aiAgentService,
        providerFactory,
      } = setup();
      conversation.create.mockResolvedValue({ id: "conv-new" });

      await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        orderId: "order-1",
        aiAgentId: "agent-1",
        message: "Hi",
      });

      expect(workspaceService.getWorkspaceById).toHaveBeenCalledWith(
        WORKSPACE_ID,
      );
      expect(customerService.getCustomerById).toHaveBeenCalledWith(
        WORKSPACE_ID,
        CUSTOMER_ID,
      );
      expect(orderService.getOrderById).toHaveBeenCalledWith("order-1");
      expect(aiAgentService.getAiAgentById).toHaveBeenCalledWith("agent-1");
      expect(providerFactory.createForWorkspace).toHaveBeenCalledWith(
        WORKSPACE_ID,
      );
    });

    it("throws NotFoundException when the order belongs to a different workspace", async () => {
      const { service, orderService } = setup();
      orderService.getOrderById.mockResolvedValue({
        id: "order-1",
        workspaceId: "other-workspace",
      });

      await expect(
        service.processMessage({
          workspaceId: WORKSPACE_ID,
          customerId: CUSTOMER_ID,
          orderId: "order-1",
          message: "Hi",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when the AI agent belongs to a different workspace", async () => {
      const { service, aiAgentService } = setup();
      aiAgentService.getAiAgentById.mockResolvedValue({
        id: "agent-1",
        workspaceId: "other-workspace",
      });

      await expect(
        service.processMessage({
          workspaceId: WORKSPACE_ID,
          customerId: CUSTOMER_ID,
          aiAgentId: "agent-1",
          message: "Hi",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("does not create a Conversation row when no AI provider is configured", async () => {
      const { service, providerFactory, conversation } = setup();
      providerFactory.createForWorkspace.mockRejectedValue(
        new Error("No AI provider configuration found"),
      );

      await expect(
        service.processMessage({
          workspaceId: WORKSPACE_ID,
          customerId: CUSTOMER_ID,
          message: "Hi",
        }),
      ).rejects.toThrow();

      expect(conversation.create).not.toHaveBeenCalled();
    });
  });

  describe("conversation resolution", () => {
    it("creates a new conversation (with callId) when none is given", async () => {
      const { service, conversation } = setup();
      conversation.create.mockResolvedValue({ id: "conv-new" });

      const result = await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        callId: "call-1",
        message: "Hi",
      });

      expect(conversation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          customerId: CUSTOMER_ID,
          callId: "call-1",
          status: "ACTIVE",
        }),
      });
      expect(result.conversationId).toBe("conv-new");
    });

    it("reuses an existing conversation when conversationId is given", async () => {
      const { service, conversation } = setup();
      conversation.findFirst.mockResolvedValue({
        id: "conv-existing",
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
      });

      const result = await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        conversationId: "conv-existing",
        message: "follow up",
      });

      expect(conversation.create).not.toHaveBeenCalled();
      expect(result.conversationId).toBe("conv-existing");
    });

    it("throws NotFoundException for a conversationId belonging to a different customer", async () => {
      const { service, conversation } = setup();
      conversation.findFirst.mockResolvedValue({
        id: "conv-existing",
        workspaceId: WORKSPACE_ID,
        customerId: "a-different-customer",
      });

      await expect(
        service.processMessage({
          workspaceId: WORKSPACE_ID,
          customerId: CUSTOMER_ID,
          conversationId: "conv-existing",
          message: "hi",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("no tool calls (plain reply)", () => {
    it("sends system+history+new-message to the provider and persists user+assistant messages", async () => {
      const { service, conversation, conversationMessage, chat, promptBuilder } =
        setup();
      conversation.create.mockResolvedValue({ id: "conv-new" });
      promptBuilder.build.mockResolvedValue({
        systemPrompt: "sys",
        history: [{ role: "user", content: "earlier" }],
      });

      await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "Hi there",
      });

      expect(chat).toHaveBeenCalledWith({
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "earlier" },
          { role: "user", content: "Hi there" },
        ],
        tools: [{ name: "lookup_order", description: "...", parameters: {} }],
      });

      expect(conversationMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conversationId: "conv-new",
          role: "USER",
          content: "Hi there",
        }),
      });
      expect(conversationMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conversationId: "conv-new",
          role: "ASSISTANT",
          content: "Hello! How can I help?",
        }),
      });
    });

    it("persists exactly one AIUsage row with provider/model/tokens/cost/latency", async () => {
      const { service, conversation, aIUsage } = setup();
      conversation.create.mockResolvedValue({ id: "conv-new" });

      await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "Hi",
      });

      expect(aIUsage.create).toHaveBeenCalledTimes(1);
      expect(aIUsage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          conversationId: "conv-new",
          provider: "OPENAI",
          model: "gpt-4o-mini",
          promptTokens: 20,
          completionTokens: 10,
          totalTokens: 30,
          latencyMs: expect.any(Number),
        }),
      });
    });

    it("returns the final content, aggregated usage, and latencyMs", async () => {
      const { service, conversation } = setup();
      conversation.create.mockResolvedValue({ id: "conv-new" });

      const result = await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "Hi",
      });

      expect(result).toMatchObject({
        conversationId: "conv-new",
        content: "Hello! How can I help?",
        provider: "OPENAI",
        model: "gpt-4o-mini",
        promptTokens: 20,
        completionTokens: 10,
        totalTokens: 30,
        toolCallsExecuted: [],
      });
      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("tool-calling loop", () => {
    it("executes a single tool call, feeds the result back, and persists TOOL_CALL + TOOL_RESULT messages", async () => {
      const { service, conversation, conversationMessage, chat, toolExecutor } =
        setup();
      conversation.create.mockResolvedValue({ id: "conv-new" });
      chat
        .mockResolvedValueOnce({
          content: "",
          model: "gpt-4o-mini",
          promptTokens: 15,
          completionTokens: 5,
          totalTokens: 20,
          rawResponse: {},
          toolCalls: [
            { id: "call_1", name: "lookup_order", arguments: { orderId: "o1" } },
          ],
        })
        .mockResolvedValueOnce({
          content: "Your order has shipped.",
          model: "gpt-4o-mini",
          promptTokens: 25,
          completionTokens: 8,
          totalTokens: 33,
          rawResponse: {},
        });

      const result = await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        orderId: "o1",
        message: "What's my order status?",
      });

      expect(chat).toHaveBeenCalledTimes(2);
      expect(toolExecutor.execute).toHaveBeenCalledWith(
        { id: "call_1", name: "lookup_order", arguments: { orderId: "o1" } },
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          customerId: CUSTOMER_ID,
          conversationId: "conv-new",
        }),
      );

      expect(conversationMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conversationId: "conv-new",
          role: "TOOL_CALL",
        }),
      });
      expect(conversationMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conversationId: "conv-new",
          role: "TOOL_RESULT",
          content: '{"ok":true}',
        }),
      });

      expect(result.content).toBe("Your order has shipped.");
      expect(result.toolCallsExecuted).toEqual(["lookup_order"]);
    });

    it("aggregates token usage/cost across every provider call made during the turn", async () => {
      const { service, conversation, chat, aIUsage } = setup();
      conversation.create.mockResolvedValue({ id: "conv-new" });
      chat
        .mockResolvedValueOnce({
          content: "",
          model: "gpt-4o-mini",
          promptTokens: 15,
          completionTokens: 5,
          totalTokens: 20,
          rawResponse: {},
          toolCalls: [{ id: "call_1", name: "lookup_order", arguments: {} }],
        })
        .mockResolvedValueOnce({
          content: "Done.",
          model: "gpt-4o-mini",
          promptTokens: 25,
          completionTokens: 8,
          totalTokens: 33,
          rawResponse: {},
        });

      const result = await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "Hi",
      });

      expect(aIUsage.create).toHaveBeenCalledTimes(2);
      expect(result.promptTokens).toBe(40);
      expect(result.completionTokens).toBe(13);
      expect(result.totalTokens).toBe(53);
    });

    it("executes multiple parallel tool calls from a single completion", async () => {
      const { service, conversation, chat, toolExecutor } = setup();
      conversation.create.mockResolvedValue({ id: "conv-new" });
      chat
        .mockResolvedValueOnce({
          content: "",
          model: "gpt-4o-mini",
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
          rawResponse: {},
          toolCalls: [
            { id: "call_1", name: "lookup_customer", arguments: {} },
            { id: "call_2", name: "lookup_order", arguments: {} },
          ],
        })
        .mockResolvedValueOnce({
          content: "Here's what I found.",
          model: "gpt-4o-mini",
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
          rawResponse: {},
        });

      const result = await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "Hi",
      });

      expect(toolExecutor.execute).toHaveBeenCalledTimes(2);
      expect(result.toolCallsExecuted).toEqual([
        "lookup_customer",
        "lookup_order",
      ]);
    });

    it("stops the loop immediately when a tool result is terminal (e.g. end_call)", async () => {
      const { service, conversation, chat, toolExecutor } = setup();
      conversation.create.mockResolvedValue({ id: "conv-new" });
      toolExecutor.execute.mockResolvedValue({
        content: '{"ended":true}',
        terminal: true,
      });
      chat.mockResolvedValueOnce({
        content: "Goodbye!",
        model: "gpt-4o-mini",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        rawResponse: {},
        toolCalls: [{ id: "call_1", name: "end_call", arguments: {} }],
      });

      const result = await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "Bye",
      });

      expect(chat).toHaveBeenCalledTimes(1);
      expect(result.content).toBe("Goodbye!");
      expect(result.toolCallsExecuted).toEqual(["end_call"]);
    });

    it("stops after MAX_TOOL_ITERATIONS even if the model keeps requesting tools", async () => {
      const { service, conversation, chat } = setup();
      conversation.create.mockResolvedValue({ id: "conv-new" });
      chat.mockResolvedValue({
        content: "",
        model: "gpt-4o-mini",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        rawResponse: {},
        toolCalls: [{ id: "call_x", name: "lookup_order", arguments: {} }],
      });

      await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "Hi",
      });

      // MAX_TOOL_ITERATIONS = 5 -- the loop must not run forever.
      expect(chat).toHaveBeenCalledTimes(5);
    });
  });
});
