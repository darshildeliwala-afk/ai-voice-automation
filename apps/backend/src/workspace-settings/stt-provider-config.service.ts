import { Injectable } from "@nestjs/common";

import { EncryptionService } from "../common/encryption/encryption.service";
import { maskSecret } from "../common/masking/mask.util";
import { PrismaService } from "../common/prisma/prisma.service";
import type { SttProviderConfig } from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";
import { UpdateSttProviderConfigDto } from "./dto/update-stt-provider-config.dto";

export type MaskedSttProviderConfig = Omit<SttProviderConfig, "apiKey"> & {
  apiKey: string | null;
};

/**
 * Streaming STT provider credentials for a workspace (Sprint 17). Same
 * insert-only + isActive pattern as AiProviderConfigService -- a new row is
 * always inserted rather than updated in place, preserving an audit trail.
 */
@Injectable()
export class SttProviderConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async getActiveConfig(
    workspaceId: string,
  ): Promise<MaskedSttProviderConfig | null> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const config = await this.prisma.sttProviderConfig.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    return config ? this.mask(config) : null;
  }

  async upsertConfig(
    workspaceId: string,
    dto: UpdateSttProviderConfigDto,
  ): Promise<MaskedSttProviderConfig> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const isActive = dto.isActive ?? true;
    const encryptedKey = this.encryptionService.encrypt(dto.apiKey);

    const created = await this.prisma.$transaction(async (tx) => {
      if (isActive) {
        await tx.sttProviderConfig.updateMany({
          where: { workspaceId, isActive: true },
          data: { isActive: false },
        });
      }

      return tx.sttProviderConfig.create({
        data: {
          workspaceId,
          provider: dto.provider,
          apiKey: encryptedKey,
          language: dto.language,
          isActive,
        },
      });
    });

    return this.mask(created);
  }

  /**
   * Internal-only accessor for the STT provider factory. Never call this
   * from a controller -- the decrypted key must never appear in an API
   * response or a log line.
   */
  async getDecryptedApiKey(workspaceId: string): Promise<string | null> {
    const config = await this.prisma.sttProviderConfig.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!config) {
      return null;
    }

    return this.encryptionService.decrypt(config.apiKey);
  }

  private mask(config: SttProviderConfig): MaskedSttProviderConfig {
    return { ...config, apiKey: maskSecret(config.apiKey) };
  }
}
