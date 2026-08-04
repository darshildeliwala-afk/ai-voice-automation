import { Injectable } from "@nestjs/common";

import { EncryptionService } from "../common/encryption/encryption.service";
import { maskSecret } from "../common/masking/mask.util";
import { PrismaService } from "../common/prisma/prisma.service";
import type { TtsProviderConfig } from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";
import { UpdateTtsProviderConfigDto } from "./dto/update-tts-provider-config.dto";

export type MaskedTtsProviderConfig = Omit<TtsProviderConfig, "apiKey"> & {
  apiKey: string | null;
};

/**
 * Streaming TTS provider credentials for a workspace (Sprint 17). Same
 * insert-only + isActive pattern as AiProviderConfigService -- a new row is
 * always inserted rather than updated in place, preserving an audit trail.
 */
@Injectable()
export class TtsProviderConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async getActiveConfig(
    workspaceId: string,
  ): Promise<MaskedTtsProviderConfig | null> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const config = await this.prisma.ttsProviderConfig.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    return config ? this.mask(config) : null;
  }

  async upsertConfig(
    workspaceId: string,
    dto: UpdateTtsProviderConfigDto,
  ): Promise<MaskedTtsProviderConfig> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const isActive = dto.isActive ?? true;
    const encryptedKey = this.encryptionService.encrypt(dto.apiKey);

    const created = await this.prisma.$transaction(async (tx) => {
      if (isActive) {
        await tx.ttsProviderConfig.updateMany({
          where: { workspaceId, isActive: true },
          data: { isActive: false },
        });
      }

      return tx.ttsProviderConfig.create({
        data: {
          workspaceId,
          provider: dto.provider,
          apiKey: encryptedKey,
          voice: dto.voice,
          isActive,
        },
      });
    });

    return this.mask(created);
  }

  /**
   * Internal-only accessor for the TTS provider factory. Never call this
   * from a controller -- the decrypted key must never appear in an API
   * response or a log line.
   */
  async getDecryptedApiKey(workspaceId: string): Promise<string | null> {
    const config = await this.prisma.ttsProviderConfig.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!config) {
      return null;
    }

    return this.encryptionService.decrypt(config.apiKey);
  }

  private mask(config: TtsProviderConfig): MaskedTtsProviderConfig {
    return { ...config, apiKey: maskSecret(config.apiKey) };
  }
}
