import { NotFoundException } from "@nestjs/common";

import { AIService } from "./ai.service";

const WORKSPACE_ID = "workspace-1";
const CUSTOMER_ID = "customer-1";

function setup() {
  const conversation = {
    create: jest.fn(),
    findFirst: jest.fn(),
  };
  const conversationMessage = { create: jest.fn() };
  const aIUsage = { create: jest.fn() };
  const prisma = {
    conversation,
    conversationMessage,
    aIUsage,
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };

  const chat = jest.fn().mockResolvedValue({
    content: "Hello! How can I help?",
    model: "gpt-4o-mini",
    promptTokens: 20,
    completionTokens: 10,
    totalTokens: 30,
    rawResponse: { id: "resp-1" },
  });
  const providerFactory = {
    createForWorkspace: jest.fn().mockResolvedValue({ chat }),
  };

  const promptBuilder = {
    build: jest.fn().mockResolvedValue({
      systemPrompt: "system context",
      history: [{ role: "user", content: "earlier message" }],
    }),
  };

  const aiProviderConfigService = {
    getActiveConfig: jest.fn().mockResolvedValue({
      provider: "OPENAI",
      isActive: true,
    }),
  };

  const service = new AIService(
    prisma as never,
    providerFactory as never,
    promptBuilder as never,
    aiProviderConfigService as never,
  );

  return {
    service,
    prisma,
    conversation,
    conversationMessage,
    aIUsage,
    providerFactory,
    chat,
    promptBuilder,
    aiProviderConfigService,
  };
}

describe("AIService", () => {
  describe("sendMessage", () => {
    it("creates a new conversation when no conversationId is given", async () => {
      const { service, conversation } = setup();
      conversation.create.mockResolvedValue({
        id: "conv-new",
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
      });

      const result = await service.sendMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "Hi there",
      });

      expect(conversation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          customerId: CUSTOMER_ID,
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

      const result = await service.sendMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "follow up",
        conversationId: "conv-existing",
      });

      expect(conversation.create).not.toHaveBeenCalled();
      expect(result.conversationId).toBe("conv-existing");
    });

    it("throws NotFoundException when the conversationId does not exist in the workspace", async () => {
      const { service, conversation } = setup();
      conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage({
          workspaceId: WORKSPACE_ID,
          customerId: CUSTOMER_ID,
          message: "hi",
          conversationId: "missing-conv",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when the conversation belongs to a different customer", async () => {
      const { service, conversation } = setup();
      conversation.findFirst.mockResolvedValue({
        id: "conv-existing",
        workspaceId: WORKSPACE_ID,
        customerId: "a-different-customer",
      });

      await expect(
        service.sendMessage({
          workspaceId: WORKSPACE_ID,
          customerId: CUSTOMER_ID,
          message: "hi",
          conversationId: "conv-existing",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("builds the prompt using the conversation id and sends system+history+new message to the provider", async () => {
      const { service, conversation, promptBuilder, chat } = setup();
      conversation.create.mockResolvedValue({
        id: "conv-new",
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
      });

      await service.sendMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        orderId: "order-1",
        aiAgentId: "agent-1",
        message: "Hi there",
      });

      expect(promptBuilder.build).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        orderId: "order-1",
        aiAgentId: "agent-1",
        conversationId: "conv-new",
      });

      expect(chat).toHaveBeenCalledWith({
        messages: [
          { role: "system", content: "system context" },
          { role: "user", content: "earlier message" },
          { role: "user", content: "Hi there" },
        ],
      });
    });

    it("persists the user message, assistant message, and usage record", async () => {
      const { service, conversation, conversationMessage, aIUsage } = setup();
      conversation.create.mockResolvedValue({
        id: "conv-new",
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
      });

      await service.sendMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "Hi there",
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
      expect(aIUsage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          conversationId: "conv-new",
          provider: "OPENAI",
          model: "gpt-4o-mini",
          promptTokens: 20,
          completionTokens: 10,
          totalTokens: 30,
        }),
      });
    });

    it("returns the completion content, token usage, and an estimated cost", async () => {
      const { service, conversation } = setup();
      conversation.create.mockResolvedValue({
        id: "conv-new",
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
      });

      const result = await service.sendMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "Hi there",
      });

      expect(result.content).toBe("Hello! How can I help?");
      expect(result.provider).toBe("OPENAI");
      expect(result.model).toBe("gpt-4o-mini");
      expect(result.promptTokens).toBe(20);
      expect(result.completionTokens).toBe(10);
      expect(result.totalTokens).toBe(30);
      expect(result.estimatedCost).toBeGreaterThan(0);
    });

    it("propagates a provider error without persisting anything", async () => {
      const { service, conversation, providerFactory, conversationMessage, aIUsage } =
        setup();
      conversation.create.mockResolvedValue({
        id: "conv-new",
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
      });
      providerFactory.createForWorkspace.mockResolvedValue({
        chat: jest.fn().mockRejectedValue(new Error("provider exploded")),
      });

      await expect(
        service.sendMessage({
          workspaceId: WORKSPACE_ID,
          customerId: CUSTOMER_ID,
          message: "Hi there",
        }),
      ).rejects.toThrow("provider exploded");

      expect(conversationMessage.create).not.toHaveBeenCalled();
      expect(aIUsage.create).not.toHaveBeenCalled();
    });
  });
});
