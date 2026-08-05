import { DashboardService } from "./dashboard.service";

const WORKSPACE_ID = "workspace-1";

function setup() {
  const call = {
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _avg: { durationSeconds: null } }),
  };
  const aIUsage = {
    aggregate: jest.fn().mockResolvedValue({ _avg: { latencyMs: null } }),
  };
  const humanTransferEvent = { count: jest.fn().mockResolvedValue(0) };
  const appointment = { count: jest.fn().mockResolvedValue(0) };
  const callQueue = { count: jest.fn().mockResolvedValue(0) };
  const customer = { count: jest.fn().mockResolvedValue(0) };
  const conversation = { count: jest.fn().mockResolvedValue(0) };
  const aiAgent = { count: jest.fn().mockResolvedValue(0) };
  const knowledgeBase = { count: jest.fn().mockResolvedValue(0) };

  const prisma = {
    call,
    aIUsage,
    humanTransferEvent,
    appointment,
    callQueue,
    customer,
    conversation,
    aiAgent,
    knowledgeBase,
  };
  const workspaceService = {
    getWorkspaceById: jest.fn().mockResolvedValue({ id: WORKSPACE_ID }),
  };

  const service = new DashboardService(prisma as never, workspaceService as never);

  return { service, prisma, workspaceService };
}

describe("DashboardService", () => {
  it("validates the workspace exists before querying anything", async () => {
    const { service, workspaceService } = setup();

    await service.getSummary(WORKSPACE_ID);

    expect(workspaceService.getWorkspaceById).toHaveBeenCalledWith(WORKSPACE_ID);
  });

  it("counts missed calls as never-answered with a terminal never-connected status", async () => {
    const { service, prisma } = setup();

    await service.getSummary(WORKSPACE_ID);

    expect(prisma.call.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          answeredAt: null,
          status: { in: ["NO_ANSWER", "BUSY", "CANCELLED", "FAILED"] },
        }),
      }),
    );
  });

  it("scopes 'active AI agents' by isActive, not the new status field", async () => {
    const { service, prisma } = setup();

    await service.getSummary(WORKSPACE_ID);

    expect(prisma.aiAgent.count).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID, isActive: true, deletedAt: null },
    });
  });

  it("scopes callbacks to CallQueue rows with a non-null reason, joined to the workspace via order", async () => {
    const { service, prisma } = setup();

    await service.getSummary(WORKSPACE_ID);

    expect(prisma.callQueue.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reason: { not: null },
          order: { workspaceId: WORKSPACE_ID },
        }),
      }),
    );
  });

  it("returns null (not NaN/0) average duration/latency when there is no data", async () => {
    const { service } = setup();

    const result = await service.getSummary(WORKSPACE_ID);

    expect(result.avgCallDurationSeconds).toBeNull();
    expect(result.avgResponseTimeMs).toBeNull();
  });

  it("aggregates every metric into a single response", async () => {
    const { service, prisma } = setup();
    prisma.call.count
      .mockResolvedValueOnce(10) // todayCalls
      .mockResolvedValueOnce(7) // todayAnswered
      .mockResolvedValueOnce(3); // todayMissed
    prisma.call.aggregate.mockResolvedValue({ _avg: { durationSeconds: 120 } });
    prisma.aIUsage.aggregate.mockResolvedValue({ _avg: { latencyMs: 450 } });
    prisma.customer.count.mockResolvedValue(50);
    prisma.conversation.count.mockResolvedValue(200);
    prisma.aiAgent.count.mockResolvedValue(4);
    prisma.knowledgeBase.count.mockResolvedValue(12);

    const result = await service.getSummary(WORKSPACE_ID);

    expect(result).toEqual({
      todayCalls: 10,
      todayAnswered: 7,
      todayMissed: 3,
      todayTransferred: 0,
      todayAppointments: 0,
      todayCallbacks: 0,
      avgCallDurationSeconds: 120,
      avgResponseTimeMs: 450,
      totalCustomers: 50,
      totalConversations: 200,
      activeAiAgents: 4,
      kbDocuments: 12,
    });
  });
});
