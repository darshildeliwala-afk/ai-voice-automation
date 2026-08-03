import { NotFoundException } from "@nestjs/common";

import { PromptBuilderService } from "./prompt-builder.service";

const WORKSPACE_ID = "workspace-1";

function setup() {
  const prisma = {
    conversationMessage: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const workspaceSettingsService = {
    getSettings: jest.fn().mockResolvedValue({
      businessName: "Acme Voice",
      website: "https://acme.example",
      address: "1 Main St",
      businessHours: { mon: "9-18" },
      timezone: "UTC",
      currency: "INR",
      language: "en",
    }),
  };
  const aiAgentService = {
    getAiAgentById: jest.fn().mockResolvedValue({
      id: "agent-1",
      workspaceId: WORKSPACE_ID,
      name: "Support Agent",
      systemPrompt: "Always be courteous.",
      greeting: "Hi, this is Acme calling.",
      knowledgeBaseId: null,
    }),
  };
  const knowledgeBaseService = {
    getKnowledgeBaseById: jest.fn().mockResolvedValue({
      id: "kb-1",
      title: "Return Policy",
      description: "How returns work",
      content: "Returns are accepted within 30 days.",
    }),
  };
  const customerService = {
    getCustomerById: jest.fn().mockResolvedValue({
      id: "customer-1",
      workspaceId: WORKSPACE_ID,
      name: "Jane Doe",
      phone: "+14155551234",
      email: "jane@example.com",
      language: "en",
    }),
  };
  const orderService = {
    getOrderById: jest.fn().mockResolvedValue({
      id: "order-1",
      workspaceId: WORKSPACE_ID,
      marketplace: "MANUAL",
      status: "PENDING",
      paymentType: "COD",
      totalAmount: 100,
      currency: "INR",
      marketplaceOrderId: "REF-1",
      items: [{ name: "Widget", quantity: 2, unitPrice: 50 }],
    }),
  };

  const service = new PromptBuilderService(
    prisma as never,
    workspaceSettingsService as never,
    aiAgentService as never,
    knowledgeBaseService as never,
    customerService as never,
    orderService as never,
  );

  return {
    service,
    prisma,
    workspaceSettingsService,
    aiAgentService,
    knowledgeBaseService,
    customerService,
    orderService,
  };
}

describe("PromptBuilderService", () => {
  it("always includes the base system instructions, workspace, and customer sections", async () => {
    const { service } = setup();

    const result = await service.build({
      workspaceId: WORKSPACE_ID,
      customerId: "customer-1",
    });

    expect(result.systemPrompt).toContain("AI voice assistant");
    expect(result.systemPrompt).toContain("# Workspace");
    expect(result.systemPrompt).toContain("Acme Voice");
    expect(result.systemPrompt).toContain("# Customer");
    expect(result.systemPrompt).toContain("Jane Doe");
    expect(result.history).toEqual([]);
  });

  it("includes the AI Agent section and its Knowledge Base when aiAgentId is given", async () => {
    const { service, aiAgentService } = setup();
    aiAgentService.getAiAgentById.mockResolvedValue({
      id: "agent-1",
      workspaceId: WORKSPACE_ID,
      name: "Support Agent",
      systemPrompt: "Always be courteous.",
      greeting: "Hi, this is Acme calling.",
      knowledgeBaseId: "kb-1",
    });

    const result = await service.build({
      workspaceId: WORKSPACE_ID,
      customerId: "customer-1",
      aiAgentId: "agent-1",
    });

    expect(result.systemPrompt).toContain("# AI Agent");
    expect(result.systemPrompt).toContain("Support Agent");
    expect(result.systemPrompt).toContain("Always be courteous.");
    expect(result.systemPrompt).toContain("# Knowledge Base");
    expect(result.systemPrompt).toContain("Returns are accepted within 30 days.");
  });

  it("omits the Knowledge Base section when the agent has none", async () => {
    const { service } = setup();

    const result = await service.build({
      workspaceId: WORKSPACE_ID,
      customerId: "customer-1",
      aiAgentId: "agent-1",
    });

    expect(result.systemPrompt).not.toContain("# Knowledge Base");
  });

  it("includes the Order section (with line items) when orderId is given", async () => {
    const { service } = setup();

    const result = await service.build({
      workspaceId: WORKSPACE_ID,
      customerId: "customer-1",
      orderId: "order-1",
    });

    expect(result.systemPrompt).toContain("# Order");
    expect(result.systemPrompt).toContain("Widget x2");
    expect(result.systemPrompt).toContain("REF-1");
  });

  it("omits the Order section when no orderId is given", async () => {
    const { service } = setup();

    const result = await service.build({
      workspaceId: WORKSPACE_ID,
      customerId: "customer-1",
    });

    expect(result.systemPrompt).not.toContain("# Order");
  });

  it("throws NotFoundException when the agent belongs to a different workspace", async () => {
    const { service, aiAgentService } = setup();
    aiAgentService.getAiAgentById.mockResolvedValue({
      id: "agent-1",
      workspaceId: "other-workspace",
      name: "Support Agent",
      knowledgeBaseId: null,
    });

    await expect(
      service.build({
        workspaceId: WORKSPACE_ID,
        customerId: "customer-1",
        aiAgentId: "agent-1",
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException when the order belongs to a different workspace", async () => {
    const { service, orderService } = setup();
    orderService.getOrderById.mockResolvedValue({
      id: "order-1",
      workspaceId: "other-workspace",
      marketplace: "MANUAL",
      status: "PENDING",
      paymentType: "COD",
      totalAmount: 100,
      currency: "INR",
      items: [],
    });

    await expect(
      service.build({
        workspaceId: WORKSPACE_ID,
        customerId: "customer-1",
        orderId: "order-1",
      }),
    ).rejects.toThrow(NotFoundException);
  });

  describe("conversation history", () => {
    it("maps USER/ASSISTANT messages to chat roles, oldest first", async () => {
      const { service, prisma } = setup();
      prisma.conversationMessage.findMany.mockResolvedValue([
        { role: "USER", content: "Hi" },
        { role: "ASSISTANT", content: "Hello, how can I help?" },
      ]);

      const result = await service.build({
        workspaceId: WORKSPACE_ID,
        customerId: "customer-1",
        conversationId: "conv-1",
      });

      expect(result.history).toEqual([
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello, how can I help?" },
      ]);
      expect(prisma.conversationMessage.findMany).toHaveBeenCalledWith({
        where: { conversationId: "conv-1" },
        orderBy: { createdAt: "asc" },
      });
    });

    it("excludes SYSTEM-role messages from history (they're not user/assistant turns)", async () => {
      const { service, prisma } = setup();
      prisma.conversationMessage.findMany.mockResolvedValue([
        { role: "SYSTEM", content: "internal note" },
        { role: "USER", content: "Hi" },
      ]);

      const result = await service.build({
        workspaceId: WORKSPACE_ID,
        customerId: "customer-1",
        conversationId: "conv-1",
      });

      expect(result.history).toEqual([{ role: "user", content: "Hi" }]);
    });

    it("returns empty history when no conversationId is given", async () => {
      const { service, prisma } = setup();

      await service.build({
        workspaceId: WORKSPACE_ID,
        customerId: "customer-1",
      });

      expect(prisma.conversationMessage.findMany).not.toHaveBeenCalled();
    });
  });
});
