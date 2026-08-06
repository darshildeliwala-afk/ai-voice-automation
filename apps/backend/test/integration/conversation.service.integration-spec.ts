import { randomUUID } from "node:crypto";

import { PrismaService } from "../../src/common/prisma/prisma.service";
import { ConversationService } from "../../src/conversation-engine/conversation.service";
import { CustomerService } from "../../src/customer/customer.service";
import { ConversationRole } from "../../src/generated/prisma/client";
import { WorkspaceService } from "../../src/workspace/workspace.service";

describe("ConversationService (integration, real Postgres)", () => {
  let prisma: PrismaService;
  let service: ConversationService;
  let customerService: CustomerService;
  let workspaceId: string;
  let customerId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const workspaceService = new WorkspaceService(prisma);
    customerService = new CustomerService(prisma, workspaceService);
    service = new ConversationService(prisma, workspaceService);

    workspaceId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'Conversation Service IT Workspace', ${`conv-svc-it-${Date.now()}`}, now(), now())
    `;

    const customer = await customerService.createCustomer(workspaceId, {
      name: "Conversation IT Customer",
      phone: "+14155590200",
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.aIUsage.deleteMany({ where: { workspaceId } });
    await prisma.conversationMessage.deleteMany({
      where: { conversation: { workspaceId } },
    });
    await prisma.conversationSummary.deleteMany({ where: { workspaceId } });
    await prisma.conversation.deleteMany({ where: { workspaceId } });
    await prisma.customer.deleteMany({ where: { workspaceId } });
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${workspaceId}::uuid`;
    await prisma.$disconnect();
  });

  it("listConversations scopes to the workspace and optionally to a customer", async () => {
    const conversation = await prisma.conversation.create({
      data: { workspaceId, customerId },
    });

    const result = await service.listConversations(workspaceId, { page: 1, limit: 20 });
    expect(result.data.some((c) => c.id === conversation.id)).toBe(true);

    const scoped = await service.listConversations(
      workspaceId,
      { page: 1, limit: 20 },
      customerId,
    );
    expect(scoped.data.every((c) => c.customerId === customerId)).toBe(true);
  });

  it("getConversationDetail 404s for a conversation that doesn't exist", async () => {
    await expect(
      service.getConversationDetail(workspaceId, randomUUID()),
    ).rejects.toThrow();
  });

  it("getConversationDetail 404s for a conversation belonging to a different workspace (Sprint 21 tenant isolation)", async () => {
    const conversation = await prisma.conversation.create({
      data: { workspaceId, customerId },
    });

    await expect(
      service.getConversationDetail(randomUUID(), conversation.id),
    ).rejects.toThrow();
  });

  it("returns messages, real toolCallId-joined tool calls, usage totals, and the attached summary", async () => {
    const conversation = await prisma.conversation.create({
      data: { workspaceId, customerId, language: "en" },
    });

    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: ConversationRole.USER,
        content: "What's the status of my order?",
      },
    });
    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: ConversationRole.TOOL_CALL,
        content: "",
        metadata: {
          toolCalls: [{ id: "call-1", name: "lookup_order", arguments: { orderId: "o1" } }],
        },
      },
    });
    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: ConversationRole.TOOL_RESULT,
        content: JSON.stringify({ status: "SHIPPED" }),
        metadata: { toolCallId: "call-1", toolName: "lookup_order" },
      },
    });
    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: ConversationRole.ASSISTANT,
        content: "Your order has shipped!",
      },
    });

    await prisma.aIUsage.create({
      data: {
        workspaceId,
        conversationId: conversation.id,
        provider: "OPENAI" as never,
        model: "gpt-4o-mini",
        promptTokens: 20,
        completionTokens: 10,
        totalTokens: 30,
        estimatedCost: 0.002,
        latencyMs: 400,
      },
    });
    await prisma.conversationSummary.create({
      data: {
        workspaceId,
        conversationId: conversation.id,
        reason: "Order status inquiry",
      },
    });

    const detail = await service.getConversationDetail(workspaceId, conversation.id);

    expect(detail.messages.map((m) => m.role)).toEqual([
      "USER",
      "TOOL_CALL",
      "TOOL_RESULT",
      "ASSISTANT",
    ]);
    expect(detail.toolCalls).toEqual([
      {
        toolName: "lookup_order",
        input: { orderId: "o1" },
        output: { status: "SHIPPED" },
        createdAt: expect.any(String),
      },
    ]);
    expect(detail.usage).toEqual({
      promptTokens: 20,
      completionTokens: 10,
      totalTokens: 30,
      estimatedCost: 0.002,
      avgLatencyMs: 400,
    });
    expect(detail.summary?.reason).toBe("Order status inquiry");
  });
});
