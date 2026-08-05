import { randomUUID } from "node:crypto";

import { AiAgentService } from "../../src/ai-agent/ai-agent.service";
import { CallQueueService } from "../../src/call-queue/call-queue.service";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { CustomerService } from "../../src/customer/customer.service";
import { DashboardService } from "../../src/dashboard/dashboard.service";
import { KnowledgeBaseService } from "../../src/knowledge-base/knowledge-base.service";
import { OrderService } from "../../src/order/order.service";
import { WorkspaceService } from "../../src/workspace/workspace.service";

function todayAt(hour: number): Date {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date;
}

function yesterdayAt(hour: number): Date {
  const date = todayAt(hour);
  date.setDate(date.getDate() - 1);
  return date;
}

describe("DashboardService (integration, real Postgres)", () => {
  let prisma: PrismaService;
  let service: DashboardService;
  let customerService: CustomerService;
  let orderService: OrderService;
  let callQueueService: CallQueueService;
  let aiAgentService: AiAgentService;
  let knowledgeBaseService: KnowledgeBaseService;
  let workspaceId: string;
  let customerId: string;
  let orderId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const workspaceService = new WorkspaceService(prisma);
    customerService = new CustomerService(prisma, workspaceService);
    orderService = new OrderService(prisma, customerService);
    callQueueService = new CallQueueService(prisma);
    aiAgentService = new AiAgentService(prisma, workspaceService);
    knowledgeBaseService = new KnowledgeBaseService(prisma, workspaceService);
    service = new DashboardService(prisma, workspaceService);

    workspaceId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'Dashboard IT Workspace', ${`dashboard-it-${Date.now()}`}, now(), now())
    `;

    const customer = await customerService.createCustomer(workspaceId, {
      name: "Dashboard IT Customer",
      phone: "+14155590100",
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
  });

  afterAll(async () => {
    await prisma.humanTransferEvent.deleteMany({ where: { workspaceId } });
    await prisma.aIUsage.deleteMany({ where: { workspaceId } });
    await prisma.conversation.deleteMany({ where: { workspaceId } });
    await prisma.appointment.deleteMany({ where: { workspaceId } });
    await prisma.call.deleteMany({ where: { workspaceId } });
    await prisma.callQueue.deleteMany({ where: { orderId } });
    await prisma.knowledgeBase.deleteMany({ where: { workspaceId } });
    await prisma.aiAgent.deleteMany({ where: { workspaceId } });
    await prisma.order.deleteMany({ where: { workspaceId } });
    await prisma.customer.deleteMany({ where: { workspaceId } });
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${workspaceId}::uuid`;
    await prisma.$disconnect();
  });

  it("matches hand-computed totals across a seeded mix of today/yesterday rows", async () => {
    // Two of today's calls: one answered+completed, one missed (NO_ANSWER).
    const answeredQueue = await callQueueService.enqueue(orderId);
    const answeredCall = await prisma.call.create({
      data: {
        workspaceId,
        orderId,
        customerId,
        callQueueId: answeredQueue.id,
        provider: "PLIVO" as never,
        phoneNumber: "+14155590100",
        status: "COMPLETED" as never,
        startedAt: todayAt(9),
        answeredAt: todayAt(9),
        durationSeconds: 120,
      },
    });

    const missedQueue = await callQueueService.enqueue(orderId);
    await prisma.call.create({
      data: {
        workspaceId,
        orderId,
        customerId,
        callQueueId: missedQueue.id,
        provider: "PLIVO" as never,
        phoneNumber: "+14155590100",
        status: "NO_ANSWER" as never,
        startedAt: todayAt(10),
        answeredAt: null,
      },
    });

    // A call from yesterday -- must not count in any "today" bucket.
    const yesterdayQueue = await callQueueService.enqueue(orderId);
    await prisma.call.create({
      data: {
        workspaceId,
        orderId,
        customerId,
        callQueueId: yesterdayQueue.id,
        provider: "PLIVO" as never,
        phoneNumber: "+14155590100",
        status: "COMPLETED" as never,
        startedAt: yesterdayAt(9),
        answeredAt: yesterdayAt(9),
        durationSeconds: 999,
      },
    });

    // A callback scheduled today (reason set) and one ordinary dial-queue
    // row (no reason) that must never count as a callback.
    await callQueueService.enqueue(orderId, todayAt(11), "Customer requested a callback");
    await callQueueService.enqueue(orderId, todayAt(12));

    // An appointment scheduled today and one scheduled yesterday.
    await prisma.appointment.create({
      data: {
        workspaceId,
        customerId,
        date: todayAt(0),
        time: "10:00",
        timezone: "UTC",
      },
    });
    await prisma.appointment.create({
      data: {
        workspaceId,
        customerId,
        date: yesterdayAt(0),
        time: "10:00",
        timezone: "UTC",
      },
    });

    // A conversation + a transfer event created today.
    const conversation = await prisma.conversation.create({
      data: { workspaceId, customerId },
    });
    await prisma.humanTransferEvent.create({
      data: {
        workspaceId,
        conversationId: conversation.id,
        reason: "Dashboard IT transfer",
      },
    });

    // AI usage row today, for the avg response time metric.
    await prisma.aIUsage.create({
      data: {
        workspaceId,
        conversationId: conversation.id,
        provider: "OPENAI" as never,
        model: "gpt-4o-mini",
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        estimatedCost: 0.001,
        latencyMs: 300,
      },
    });

    // One active + one inactive agent -- only the active one counts.
    await aiAgentService.createAiAgent({
      workspaceId,
      name: `Active Agent ${randomUUID()}`,
      provider: "openai",
      model: "gpt-4o-mini",
      voice: "alloy",
      language: "en",
    } as never);
    await aiAgentService.createAiAgent({
      workspaceId,
      name: `Inactive Agent ${randomUUID()}`,
      provider: "openai",
      model: "gpt-4o-mini",
      voice: "alloy",
      language: "en",
      isActive: false,
    } as never);

    // Two knowledge base documents.
    await knowledgeBaseService.createKnowledgeBase({
      workspaceId,
      title: "Doc 1",
      content: "Content 1",
    });
    await knowledgeBaseService.createKnowledgeBase({
      workspaceId,
      title: "Doc 2",
      content: "Content 2",
    });

    const summary = await service.getSummary(workspaceId);

    expect(summary.todayCalls).toBe(2);
    expect(summary.todayAnswered).toBe(1);
    expect(summary.todayMissed).toBe(1);
    expect(summary.todayTransferred).toBe(1);
    expect(summary.todayAppointments).toBe(1);
    expect(summary.todayCallbacks).toBe(1);
    expect(summary.avgCallDurationSeconds).toBe(120);
    expect(summary.avgResponseTimeMs).toBe(300);
    expect(summary.totalCustomers).toBe(1);
    expect(summary.totalConversations).toBe(1);
    expect(summary.activeAiAgents).toBe(1);
    expect(summary.kbDocuments).toBe(2);

    // Sanity: the answered call from today is still findable and distinct
    // from the yesterday one used to prove today-scoping works.
    const reloadedAnswered = await prisma.call.findUniqueOrThrow({
      where: { id: answeredCall.id },
    });
    expect(reloadedAnswered.status).toBe("COMPLETED");
  });
});
