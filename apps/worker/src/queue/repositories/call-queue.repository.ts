import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../common/prisma/prisma.service";
import { QueueStatus, type CallQueue } from "../../generated/prisma/client";
import type { ICallQueueRepository } from "./call-queue.repository.interface";

@Injectable()
export class CallQueueRepository implements ICallQueueRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findDue(limit: number, now: Date): Promise<CallQueue[]> {
    return this.prisma.callQueue.findMany({
      where: {
        status: QueueStatus.QUEUED,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  async claim(id: string, workerId: string): Promise<CallQueue | null> {
    const { count } = await this.prisma.callQueue.updateMany({
      where: { id, status: QueueStatus.QUEUED },
      data: {
        status: QueueStatus.CALLING,
        lockedAt: new Date(),
        workerId,
        startedAt: new Date(),
      },
    });

    if (count === 0) {
      return null;
    }

    return this.prisma.callQueue.findUnique({ where: { id } });
  }

  async complete(id: string): Promise<void> {
    await this.prisma.callQueue.update({
      where: { id },
      data: {
        status: QueueStatus.COMPLETED,
        completedAt: new Date(),
        lockedAt: null,
        workerId: null,
      },
    });
  }

  async requeue(id: string, error: string): Promise<void> {
    await this.prisma.callQueue.update({
      where: { id },
      data: {
        status: QueueStatus.QUEUED,
        attemptCount: { increment: 1 },
        lastError: error,
        lockedAt: null,
        workerId: null,
      },
    });
  }

  async fail(id: string, error: string): Promise<void> {
    await this.prisma.callQueue.update({
      where: { id },
      data: {
        status: QueueStatus.FAILED,
        attemptCount: { increment: 1 },
        lastError: error,
        completedAt: new Date(),
        lockedAt: null,
        workerId: null,
      },
    });
  }

  async findById(id: string): Promise<CallQueue | null> {
    return this.prisma.callQueue.findUnique({ where: { id } });
  }

  async recoverStaleLocks(staleBefore: Date): Promise<number> {
    const { count } = await this.prisma.callQueue.updateMany({
      where: { status: QueueStatus.CALLING, lockedAt: { lt: staleBefore } },
      data: { status: QueueStatus.QUEUED, lockedAt: null, workerId: null },
    });

    return count;
  }

  async getStatusCounts(): Promise<Record<string, number>> {
    const groups = await this.prisma.callQueue.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    const counts: Record<string, number> = {};
    for (const status of Object.values(QueueStatus)) {
      counts[status] = 0;
    }
    for (const group of groups) {
      counts[group.status] = group._count._all;
    }

    return counts;
  }
}
