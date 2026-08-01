import { Injectable } from "@nestjs/common";

import { BaseService } from "../common/base/base.service";
import { EncryptionService } from "../common/encryption/encryption.service";
import { maskSecret } from "../common/masking/mask.util";
import { PrismaService } from "../common/prisma/prisma.service";
import type { TelephonyConfig } from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";
import { UpdateTelephonyConfigDto } from "./dto/update-telephony-config.dto";

export type MaskedTelephonyConfig = Omit<TelephonyConfig, "authToken"> & {
  authToken: string | null;
};

@Injectable()
export class TelephonyConfigService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly encryptionService: EncryptionService,
  ) {
    super();
  }

  async getActiveConfig(
    workspaceId: string,
  ): Promise<MaskedTelephonyConfig | null> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const config = await this.prisma.telephonyConfig.findFirst({
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
    dto: UpdateTelephonyConfigDto,
  ): Promise<MaskedTelephonyConfig> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const isActive = dto.isActive ?? true;
    const encryptedToken = this.encryptionService.encrypt(dto.authToken);

    const created = await this.prisma.$transaction(async (tx) => {
      if (isActive) {
        await tx.telephonyConfig.updateMany({
          where: { workspaceId, isActive: true },
          data: { isActive: false },
        });
      }

      return tx.telephonyConfig.create({
        data: {
          workspaceId,
          provider: dto.provider,
          authId: dto.authId,
          authToken: encryptedToken,
          phoneNumber: dto.phoneNumber,
          webhookSecret: dto.webhookSecret,
          isActive,
        },
      });
    });

    return this.mask(created);
  }

  /**
   * Internal-only accessor for future provider modules (e.g. a Telephony
   * calling module). Never call this from a controller -- the decrypted
   * token must never appear in an API response or a log line.
   */
  async getDecryptedAuthToken(workspaceId: string): Promise<string | null> {
    const config = await this.prisma.telephonyConfig.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!config) {
      return null;
    }

    return this.encryptionService.decrypt(config.authToken);
  }

  private mask(config: TelephonyConfig): MaskedTelephonyConfig {
    return { ...config, authToken: maskSecret(config.authToken) };
  }
}
