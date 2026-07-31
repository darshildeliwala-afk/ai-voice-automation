import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../common/prisma/prisma.service";
import { QueueStatus, type CallQueue } from "../generated/prisma/client";

const MAX_ATTEMPTS = 3;

@Injectable()
export class CallQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(orderId: string): Promise<CallQueue> {
    return this.prisma.callQueue.create({
      data: {
        orderId,
        status: QueueStatus.QUEUED,
        scheduledAt: new Date(),
        attemptCount: 0,
      },
    });
  }

  async dequeue(): Promise<CallQueue | null> {
    return this.prisma.$transaction(async (tx) => {
      const next = await tx.callQueue.findFirst({
        where: { status: QueueStatus.QUEUED },
        orderBy: { scheduledAt: "asc" },
      });

      if (!next) {
        return null;
      }

      return tx.callQueue.update({
        where: { id: next.id },
        data: { status: QueueStatus.CALLING },
      });
    });
  }

  async complete(queueId: string): Promise<CallQueue> {
    await this.getQueueItemById(queueId);

    return this.prisma.callQueue.update({
      where: { id: queueId },
      data: { status: QueueStatus.COMPLETED },
    });
  }

  async fail(queueId: string, reason: string): Promise<CallQueue> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.callQueue.findFirst({ where: { id: queueId } });

      if (!item) {
        throw new NotFoundException(`Call queue item ${queueId} not found`);
      }

      const attemptCount = item.attemptCount + 1;
      const status =
        attemptCount < MAX_ATTEMPTS ? QueueStatus.QUEUED : QueueStatus.FAILED;

      return tx.callQueue.update({
        where: { id: queueId },
        data: { attemptCount, status, lastError: reason },
      });
    });
  }

  private async getQueueItemById(id: string): Promise<CallQueue> {
    const item = await this.prisma.callQueue.findFirst({ where: { id } });

    if (!item) {
      throw new NotFoundException(`Call queue item ${id} not found`);
    }

    return item;
  }
}
