import { Injectable } from "@nestjs/common";

import { PrismaService } from "../common/prisma/prisma.service";
import { CallStatus } from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";

export interface DashboardSummary {
  todayCalls: number;
  todayAnswered: number;
  todayMissed: number;
  todayTransferred: number;
  todayAppointments: number;
  todayCallbacks: number;
  avgCallDurationSeconds: number | null;
  avgResponseTimeMs: number | null;
  totalCustomers: number;
  totalConversations: number;
  activeAiAgents: number;
  kbDocuments: number;
}

/** Calls that never connected -- the "missed" bucket for the dashboard. */
const MISSED_CALL_STATUSES: CallStatus[] = [
  CallStatus.NO_ANSWER,
  CallStatus.BUSY,
  CallStatus.CANCELLED,
  CallStatus.FAILED,
];

/**
 * Workspace-scoped admin dashboard summary (Sprint 20) -- one Promise.all
 * of prisma.count/aggregate calls, mirroring the Promise.all([findMany,
 * count]) idiom already used by every *.service.ts list method. No new
 * tables, purely reads across existing models.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async getSummary(workspaceId: string): Promise<DashboardSummary> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const { start, end } = getTodayRange();
    // Call.startedAt is nullable (set only once a call actually rings) --
    // fall back to createdAt for "today" bucketing so a call that was
    // queued but never dialed yet still shows up.
    const startedTodayOrCreatedToday = {
      OR: [
        { startedAt: { gte: start, lt: end } },
        { startedAt: null, createdAt: { gte: start, lt: end } },
      ],
    };

    const [
      todayCalls,
      todayAnswered,
      todayMissed,
      todayTransferred,
      todayAppointments,
      todayCallbacks,
      durationAgg,
      latencyAgg,
      totalCustomers,
      totalConversations,
      activeAiAgents,
      kbDocuments,
    ] = await Promise.all([
      this.prisma.call.count({
        where: { workspaceId, ...startedTodayOrCreatedToday },
      }),
      this.prisma.call.count({
        where: { workspaceId, answeredAt: { gte: start, lt: end } },
      }),
      this.prisma.call.count({
        where: {
          workspaceId,
          answeredAt: null,
          status: { in: MISSED_CALL_STATUSES },
          ...startedTodayOrCreatedToday,
        },
      }),
      this.prisma.humanTransferEvent.count({
        where: { workspaceId, createdAt: { gte: start, lt: end } },
      }),
      this.prisma.appointment.count({
        where: { workspaceId, deletedAt: null, date: { gte: start, lt: end } },
      }),
      this.prisma.callQueue.count({
        where: {
          reason: { not: null },
          scheduledAt: { gte: start, lt: end },
          order: { workspaceId },
        },
      }),
      this.prisma.call.aggregate({
        where: {
          workspaceId,
          durationSeconds: { not: null },
          startedAt: { gte: start, lt: end },
        },
        _avg: { durationSeconds: true },
      }),
      this.prisma.aIUsage.aggregate({
        where: { workspaceId, latencyMs: { not: null }, createdAt: { gte: start, lt: end } },
        _avg: { latencyMs: true },
      }),
      this.prisma.customer.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.conversation.count({ where: { workspaceId } }),
      // Deliberately isActive, not the new AiAgentStatus -- see ai-agent.service.ts's own note.
      this.prisma.aiAgent.count({
        where: { workspaceId, isActive: true, deletedAt: null },
      }),
      this.prisma.knowledgeBase.count({ where: { workspaceId, deletedAt: null } }),
    ]);

    return {
      todayCalls,
      todayAnswered,
      todayMissed,
      todayTransferred,
      todayAppointments,
      todayCallbacks,
      avgCallDurationSeconds: durationAgg._avg.durationSeconds ?? null,
      avgResponseTimeMs: latencyAgg._avg.latencyMs ?? null,
      totalCustomers,
      totalConversations,
      activeAiAgents,
      kbDocuments,
    };
  }
}

function getTodayRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}
