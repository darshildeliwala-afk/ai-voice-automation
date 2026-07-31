import { ConflictException, Injectable } from "@nestjs/common";

import { BaseService } from "../common/base/base.service";
import type { PaginationDto } from "../common/pagination/pagination.dto";
import {
  buildPaginationMeta,
  type PaginationMeta,
} from "../common/pagination/pagination.util";
import { PrismaService } from "../common/prisma/prisma.service";
import { Prisma, type AiAgent } from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";
import { CreateAiAgentDto } from "./dto/create-ai-agent.dto";
import { UpdateAiAgentDto } from "./dto/update-ai-agent.dto";

export interface PaginatedAiAgents {
  data: AiAgent[];
  meta: PaginationMeta;
}

@Injectable()
export class AiAgentService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {
    super();
  }

  async createAiAgent(dto: CreateAiAgentDto): Promise<AiAgent> {
    await this.workspaceService.getWorkspaceById(dto.workspaceId);

    const isActive = dto.isActive ?? true;

    if (isActive) {
      await this.assertNameNotTakenByActiveAgent(dto.workspaceId, dto.name);
    }

    return this.prisma.aiAgent.create({ data: dto });
  }

  async getAiAgentById(id: string): Promise<AiAgent> {
    const agent = this.throwIfNotFound(
      await this.prisma.aiAgent.findFirst({
        where: this.applySoftDelete({ id }),
      }),
      "AI Agent",
      id,
    );

    await this.workspaceService.getWorkspaceById(agent.workspaceId);

    return agent;
  }

  async listAiAgents(
    workspaceId: string,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedAiAgents> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const { skip, take, orderBy } = this.buildPagination(pagination);

    const where: Prisma.AiAgentWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(search
        ? { name: { contains: search, mode: Prisma.QueryMode.insensitive } }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.aiAgent.findMany({ where, skip, take, orderBy }),
      this.prisma.aiAgent.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, pagination) };
  }

  async updateAiAgent(id: string, dto: UpdateAiAgentDto): Promise<AiAgent> {
    const agent = await this.getAiAgentById(id);

    const nextIsActive = dto.isActive ?? agent.isActive;
    const nextName = dto.name ?? agent.name;

    if (nextIsActive) {
      await this.assertNameNotTakenByActiveAgent(
        agent.workspaceId,
        nextName,
        id,
      );
    }

    return this.prisma.aiAgent.update({
      where: { id },
      data: dto,
    });
  }

  async softDeleteAiAgent(id: string): Promise<AiAgent> {
    await this.getAiAgentById(id);

    return this.prisma.aiAgent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async assertNameNotTakenByActiveAgent(
    workspaceId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const where: Prisma.AiAgentWhereInput = {
      workspaceId,
      name,
      isActive: true,
      deletedAt: null,
    };

    if (excludeId) {
      where.id = { not: excludeId };
    }

    const duplicate = await this.prisma.aiAgent.findFirst({ where });

    if (duplicate) {
      throw new ConflictException(
        `An active AI Agent named "${name}" already exists in this workspace`,
      );
    }
  }
}
