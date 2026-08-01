import { Injectable } from "@nestjs/common";

import { BaseService } from "../common/base/base.service";
import { PrismaService } from "../common/prisma/prisma.service";
import type { WorkspaceSettings } from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";
import { UpdateWorkspaceSettingsDto } from "./dto/update-workspace-settings.dto";

@Injectable()
export class WorkspaceSettingsService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {
    super();
  }

  /** Returns the workspace's settings, auto-provisioning defaults on first access. */
  async getSettings(workspaceId: string): Promise<WorkspaceSettings> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const existing = await this.prisma.workspaceSettings.findUnique({
      where: { workspaceId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.workspaceSettings.create({
      data: { workspaceId },
    });
  }

  async updateSettings(
    workspaceId: string,
    dto: UpdateWorkspaceSettingsDto,
  ): Promise<WorkspaceSettings> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    return this.prisma.workspaceSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, ...dto },
      update: dto,
    });
  }
}
