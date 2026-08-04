import { Injectable } from "@nestjs/common";

import { SttProviderConfigService } from "../../workspace-settings/stt-provider-config.service";
import {
  STTProviderConfigMissingError,
  STTProviderInactiveError,
} from "../errors/ai.errors";
import type { ISTTProvider } from "../interfaces/stt-provider.interface";
import { createSTTProvider } from "./create-stt-provider";

/**
 * Resolves the caller's workspace SttProviderConfig via
 * SttProviderConfigService (already wired for masking + AES-256-GCM
 * decryption) and hands back a ready-to-use ISTTProvider. Mirrors
 * AIProviderFactory's exact shape.
 */
@Injectable()
export class STTProviderFactory {
  constructor(
    private readonly sttProviderConfigService: SttProviderConfigService,
  ) {}

  async createForWorkspace(workspaceId: string): Promise<ISTTProvider> {
    const config =
      await this.sttProviderConfigService.getActiveConfig(workspaceId);

    if (!config) {
      throw new STTProviderConfigMissingError(workspaceId);
    }

    if (!config.isActive) {
      throw new STTProviderInactiveError(workspaceId);
    }

    const apiKey =
      await this.sttProviderConfigService.getDecryptedApiKey(workspaceId);

    if (!apiKey) {
      throw new STTProviderConfigMissingError(workspaceId);
    }

    return createSTTProvider(config.provider, {
      provider: config.provider,
      apiKey,
      language: config.language,
    });
  }
}
