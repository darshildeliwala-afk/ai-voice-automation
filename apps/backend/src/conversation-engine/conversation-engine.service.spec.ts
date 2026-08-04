import { NotFoundException } from "@nestjs/common";

import { ConversationEngineService } from "./conversation-engine.service";

const WORKSPACE_ID = "workspace-1";
const CUSTOMER_ID = "customer-1";

function setup() {
  const conversation = {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  };
  const conversationMessage = { create: jest.fn().mockResolvedValue({}) };
  const prisma = { conversation, conversationMessage };

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

  const chat = jest.fn();
  const providerFactory = {
    createForWorkspace: jest.fn().mockResolvedValue({ chat }),
  };

  const promptBuilder = {
    build: jest.fn().mockResolvedValue({
      systemPrompt: "system context",
      history: [],
      resolvedLanguage: "hi-en",
      pauseDurationsMs: { short: 300, medium: 500, long: 700 },
    }),
  };

  const languageDetectionService = {
    detectLanguagePreference: jest.fn().mockReturnValue(null),
  };

  const aiProviderConfigService = {
    getActiveConfig: jest.fn().mockResolvedValue({
      provider: "OPENAI",
      isActive: true,
    }),
  };

  const graph = { entryNodeKey: "start", nodes: [{ key: "start", type: "PROMPT", config: {} }] };
  const workflowService = {
    resolveActiveGraph: jest.fn().mockResolvedValue(graph),
  };
  const workflowExecutionEngine = {
    execute: jest.fn().mockResolvedValue({
      content: "Hello! How can I help?",
      toolCallsExecuted: [],
      provider: "OPENAI",
      model: "gpt-4o-mini",
      promptTokens: 20,
      completionTokens: 10,
      totalTokens: 30,
      estimatedCost: 0.001,
      stepsExecuted: 1,
    }),
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
    workflowService as never,
    workflowExecutionEngine as never,
    languageDetectionService as never,
  );

  return {
    service,
    prisma,
    conversation,
    conversationMessage,
    workspaceService,
    customerService,
    orderService,
    aiAgentService,
    providerFactory,
    chat,
    promptBuilder,
    aiProviderConfigService,
    workflowService,
    workflowExecutionEngine,
    languageDetectionService,
    graph,
  };
}

describe("ConversationEngineService", () => {
  describe("context loading / validation", () => {
    it("validates the workspace, customer, order, and agent before resolving a provider or workflow", async () => {
      const {
        service,
        conversation,
        workspaceService,
        customerService,
        orderService,
        aiAgentService,
        providerFactory,
        workflowService,
      } = setup();
      conversation.create.mockResolvedValue({ id: "conv-new" });

      await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        orderId: "order-1",
        aiAgentId: "agent-1",
        message: "Hi",
      });

      expect(workspaceService.getWorkspaceById).toHaveBeenCalledWith(WORKSPACE_ID);
      expect(customerService.getCustomerById).toHaveBeenCalledWith(WORKSPACE_ID, CUSTOMER_ID);
      expect(orderService.getOrderById).toHaveBeenCalledWith("order-1");
      expect(aiAgentService.getAiAgentById).toHaveBeenCalledWith("agent-1");
      expect(providerFactory.createForWorkspace).toHaveBeenCalledWith(WORKSPACE_ID);
      expect(workflowService.resolveActiveGraph).toHaveBeenCalledWith(WORKSPACE_ID, "agent-1");
    });

    it("throws NotFoundException when the order belongs to a different workspace", async () => {
      const { service, orderService } = setup();
      orderService.getOrderById.mockResolvedValue({ id: "order-1", workspaceId: "other-workspace" });

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
      aiAgentService.getAiAgentById.mockResolvedValue({ id: "agent-1", workspaceId: "other-workspace" });

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
        service.processMessage({ workspaceId: WORKSPACE_ID, customerId: CUSTOMER_ID, message: "Hi" }),
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

  describe("workflow execution", () => {
    it("persists the USER message and hands system+history+user messages to the workflow engine", async () => {
      const { service, conversation, conversationMessage, promptBuilder, workflowExecutionEngine, graph } =
        setup();
      conversation.create.mockResolvedValue({ id: "conv-new" });
      promptBuilder.build.mockResolvedValue({
        systemPrompt: "sys",
        history: [{ role: "user", content: "earlier" }],
      });

      await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        orderId: "order-1",
        aiAgentId: "agent-1",
        message: "Hi there",
      });

      expect(conversationMessage.create).toHaveBeenCalledWith({
        data: { conversationId: "conv-new", role: "USER", content: "Hi there" },
      });

      expect(workflowExecutionEngine.execute).toHaveBeenCalledWith(graph, {
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        conversationId: "conv-new",
        orderId: "order-1",
        aiAgentId: "agent-1",
        provider: expect.any(Object),
        providerName: "OPENAI",
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "earlier" },
          { role: "user", content: "Hi there" },
        ],
        state: {},
      });
    });

    it("returns the workflow engine's result mapped into ProcessMessageResult", async () => {
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
        estimatedCost: 0.001,
        toolCallsExecuted: [],
      });
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("propagates toolCallsExecuted from the workflow engine's result", async () => {
      const { service, conversation, workflowExecutionEngine } = setup();
      conversation.create.mockResolvedValue({ id: "conv-new" });
      workflowExecutionEngine.execute.mockResolvedValue({
        content: "Your order shipped.",
        toolCallsExecuted: ["lookup_order"],
        provider: "OPENAI",
        model: "gpt-4o-mini",
        promptTokens: 40,
        completionTokens: 15,
        totalTokens: 55,
        estimatedCost: 0.002,
        stepsExecuted: 2,
      });

      const result = await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "Where's my order?",
      });

      expect(result.toolCallsExecuted).toEqual(["lookup_order"]);
      expect(result.totalTokens).toBe(55);
    });
  });

  describe("language detection (Sprint 18)", () => {
    it("persists a detected language onto the Conversation and threads it into the prompt builder", async () => {
      const { service, conversation, languageDetectionService, promptBuilder } =
        setup();
      conversation.create.mockResolvedValue({ id: "conv-new", language: null });
      languageDetectionService.detectLanguagePreference.mockReturnValue({
        code: "hi",
        label: "Hindi",
        supported: true,
      });
      promptBuilder.build.mockResolvedValue({
        systemPrompt: "sys",
        history: [],
        resolvedLanguage: "hi",
        pauseDurationsMs: { short: 300, medium: 500, long: 700 },
      });

      const result = await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "Hindi mein boliye",
      });

      expect(conversation.update).toHaveBeenCalledWith({
        where: { id: "conv-new" },
        data: { language: "hi" },
      });
      expect(promptBuilder.build).toHaveBeenCalledWith(
        expect.objectContaining({ resolvedLanguage: "hi" }),
      );
      expect(result.resolvedLanguage).toBe("hi");
    });

    it("does not touch the Conversation when no explicit language preference is detected", async () => {
      const { service, conversation, languageDetectionService } = setup();
      conversation.create.mockResolvedValue({ id: "conv-new", language: null });
      languageDetectionService.detectLanguagePreference.mockReturnValue(null);

      const result = await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "What's the status of my order?",
      });

      expect(conversation.update).not.toHaveBeenCalled();
      expect(result.resolvedLanguage).toBe("hi-en");
    });

    it("does not re-persist when the detected language matches what's already stored", async () => {
      const { service, conversation, languageDetectionService } = setup();
      conversation.create.mockResolvedValue({ id: "conv-new", language: "hi" });
      languageDetectionService.detectLanguagePreference.mockReturnValue({
        code: "hi",
        label: "Hindi",
        supported: true,
      });

      await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "Hindi mein hi boliye",
      });

      expect(conversation.update).not.toHaveBeenCalled();
    });
  });

  describe("abort signal (barge-in cancellation, Sprint 18)", () => {
    it("forwards ProcessMessageInput.abortSignal into the workflow execution context", async () => {
      const { service, conversation, workflowExecutionEngine } = setup();
      conversation.create.mockResolvedValue({ id: "conv-new" });
      const controller = new AbortController();

      await service.processMessage({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        message: "Hi",
        abortSignal: controller.signal,
      });

      expect(workflowExecutionEngine.execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ abortSignal: controller.signal }),
      );
    });
  });
});
