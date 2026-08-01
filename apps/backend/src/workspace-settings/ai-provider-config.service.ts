import { Injectable } from "@nestjs/common";

import { BaseService } from "../common/base/base.service";
import { EncryptionService } from "../common/encryption/encryption.service";
import { maskSecret } from "../common/masking/mask.util";
import { PrismaService } from "../common/prisma/prisma.service";
import type { AiProviderConfig } from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";
import { UpdateAiProviderConfigDto } from "./dto/update-ai-provider-config.dto";

export type MaskedAiProviderConfig = Omit<AiProviderConfig, "apiKey"> & {
  apiKey: string | null;
};

@Injectable()
export class AiProviderConfigService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly encryptionService: EncryptionService,
  ) {
    super();
  }

  async getActiveConfig(
    workspaceId: string,
  ): Promise<MaskedAiProviderConfig | null> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const config = await this.prisma.aiProviderConfig.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    return config ? this.mask(config) : null;
  }

  /**
   * Creates a new config row and (by default) deactivates any previously
   * active config for the workspace, so at most one is active at a time.
   * A new row is always inserted rather than updated in place, preserving
   * an audit trail of credential changes.
   */
  async upsertConfig(
    workspaceId: string,
    dto: UpdateAiProviderConfigDto,
  ): Promise<MaskedAiProviderConfig> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const isActive = dto.isActive ?? true;
    const encryptedKey = this.encryptionService.encrypt(dto.apiKey);

    const created = await this.prisma.$transaction(async (tx) => {
      if (isActive) {
        await tx.aiProviderConfig.updateMany({
          where: { workspaceId, isActive: true },
          data: { isActive: false },
        });
      }

      return tx.aiProviderConfig.create({
        data: {
          workspaceId,
          provider: dto.provider,
          apiKey: encryptedKey,
          defaultModel: dto.defaultModel,
          temperature: dto.temperature,
          isActive,
        },
      });
    });

    return this.mask(created);
  }

  /**
   * Internal-only accessor for future AI provider modules. Never call this
   * from a controller -- the decrypted key must never appear in an API
   * response or a log line.
   */
  async getDecryptedApiKey(workspaceId: string): Promise<string | null> {
    const config = await this.prisma.aiProviderConfig.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!config) {
      return null;
    }

    return this.encryptionService.decrypt(config.apiKey);
  }

  private mask(config: AiProviderConfig): MaskedAiProviderConfig {
    return { ...config, apiKey: maskSecret(config.apiKey) };
  }
}
