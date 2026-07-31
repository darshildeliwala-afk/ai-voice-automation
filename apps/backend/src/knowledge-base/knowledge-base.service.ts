import { Injectable } from "@nestjs/common";

import { BaseService } from "../common/base/base.service";
import type { PaginationDto } from "../common/pagination/pagination.dto";
import {
  buildPaginationMeta,
  type PaginationMeta,
} from "../common/pagination/pagination.util";
import { PrismaService } from "../common/prisma/prisma.service";
import { Prisma, type KnowledgeBase } from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";
import { CreateKnowledgeBaseDto } from "./dto/create-knowledge-base.dto";
import { UpdateKnowledgeBaseDto } from "./dto/update-knowledge-base.dto";

export interface PaginatedKnowledgeBases {
  data: KnowledgeBase[];
  meta: PaginationMeta;
}

@Injectable()
export class KnowledgeBaseService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {
    super();
  }

  async createKnowledgeBase(
    dto: CreateKnowledgeBaseDto,
  ): Promise<KnowledgeBase> {
    await this.workspaceService.getWorkspaceById(dto.workspaceId);

    return this.prisma.knowledgeBase.create({ data: dto });
  }

  async getKnowledgeBaseById(id: string): Promise<KnowledgeBase> {
    const knowledgeBase = this.throwIfNotFound(
      await this.prisma.knowledgeBase.findFirst({
        where: this.applySoftDelete({ id }),
      }),
      "Knowledge Base",
      id,
    );

    await this.workspaceService.getWorkspaceById(knowledgeBase.workspaceId);

    return knowledgeBase;
  }

  async listKnowledgeBases(
    workspaceId: string,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedKnowledgeBases> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const { skip, take, orderBy } = this.buildPagination(pagination);

    const where: Prisma.KnowledgeBaseWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(search
        ? { title: { contains: search, mode: Prisma.QueryMode.insensitive } }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.knowledgeBase.findMany({ where, skip, take, orderBy }),
      this.prisma.knowledgeBase.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, pagination) };
  }

  async updateKnowledgeBase(
    id: string,
    dto: UpdateKnowledgeBaseDto,
  ): Promise<KnowledgeBase> {
    await this.getKnowledgeBaseById(id);

    return this.prisma.knowledgeBase.update({
      where: { id },
      data: dto,
    });
  }

  async softDeleteKnowledgeBase(id: string): Promise<KnowledgeBase> {
    await this.getKnowledgeBaseById(id);

    return this.prisma.knowledgeBase.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
