import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../common/prisma/prisma.service";
import type { Workspace } from "../generated/prisma/client";
import { CreateWorkspaceDto } from "./dto/create-workspace.dto";
import { UpdateWorkspaceDto } from "./dto/update-workspace.dto";

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkspace(dto: CreateWorkspaceDto): Promise<Workspace> {
    return this.prisma.workspace.create({
      data: dto,
    });
  }

  async getWorkspaceById(id: string): Promise<Workspace> {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id, deletedAt: null },
    });

    if (!workspace) {
      throw new NotFoundException(`Workspace ${id} not found`);
    }

    return workspace;
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return this.prisma.workspace.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateWorkspace(
    id: string,
    dto: UpdateWorkspaceDto,
  ): Promise<Workspace> {
    await this.getWorkspaceById(id);

    return this.prisma.workspace.update({
      where: { id },
      data: dto,
    });
  }

  async softDeleteWorkspace(id: string): Promise<Workspace> {
    await this.getWorkspaceById(id);

    return this.prisma.workspace.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
