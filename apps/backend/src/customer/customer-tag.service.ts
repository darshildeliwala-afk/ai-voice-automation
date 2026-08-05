import { Injectable } from "@nestjs/common";

import { PrismaService } from "../common/prisma/prisma.service";
import { CustomerService } from "./customer.service";
import { normalizeTag } from "./tag-normalizer";

export interface UpdateCustomerTagsInput {
  add?: string[];
  remove?: string[];
}

export interface TagUsageStat {
  tag: string;
  usageCount: number;
}

/**
 * Intelligent tag management (Sprint 19): normalizes/dedupes tags via
 * Set semantics (never a duplicate, case/whitespace-insensitive),
 * maintains a per-workspace usage count (WorkspaceTagStat) for admin
 * "suggest frequently used tags" UIs, and only ever applies add/remove
 * deltas -- never a full replace -- so a manually-added tag survives
 * untouched unless a caller's `remove` list explicitly names it.
 */
@Injectable()
export class CustomerTagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerService: CustomerService,
  ) {}

  async updateTags(
    workspaceId: string,
    customerId: string,
    changes: UpdateCustomerTagsInput,
  ): Promise<string[]> {
    const customer = await this.customerService.getCustomerById(
      workspaceId,
      customerId,
    );

    const addTags = (changes.add ?? [])
      .map(normalizeTag)
      .filter((tag) => tag.length > 0);
    const removeTags = new Set(
      (changes.remove ?? []).map(normalizeTag).filter((tag) => tag.length > 0),
    );

    const current = new Set(customer.tags);
    const next = new Set(current);
    for (const tag of removeTags) next.delete(tag);
    for (const tag of addTags) next.add(tag);

    const added = [...next].filter((tag) => !current.has(tag));
    const removed = [...current].filter((tag) => !next.has(tag));

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: { tags: [...next] },
      });

      for (const tag of added) {
        await tx.workspaceTagStat.upsert({
          where: { workspaceId_tag: { workspaceId, tag } },
          create: { workspaceId, tag, usageCount: 1 },
          update: { usageCount: { increment: 1 } },
        });
      }

      for (const tag of removed) {
        const stat = await tx.workspaceTagStat.findUnique({
          where: { workspaceId_tag: { workspaceId, tag } },
        });
        if (stat && stat.usageCount > 0) {
          await tx.workspaceTagStat.update({
            where: { workspaceId_tag: { workspaceId, tag } },
            data: { usageCount: stat.usageCount - 1 },
          });
        }
      }
    });

    return [...next];
  }

  /** Sorted by usageCount desc -- backs the admin UI's "frequently used tags" suggestions. */
  async getTopTags(workspaceId: string, limit = 20): Promise<TagUsageStat[]> {
    const stats = await this.prisma.workspaceTagStat.findMany({
      where: { workspaceId },
      orderBy: { usageCount: "desc" },
      take: limit,
    });

    return stats.map((stat) => ({ tag: stat.tag, usageCount: stat.usageCount }));
  }
}
