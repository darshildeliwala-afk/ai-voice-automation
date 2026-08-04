import { Injectable } from "@nestjs/common";

import { TtsProviderConfigService } from "../../workspace-settings/tts-provider-config.service";
import {
  TTSProviderConfigMissingError,
  TTSProviderInactiveError,
} from "../errors/ai.errors";
import type { ITTSProvider } from "../interfaces/tts-provider.interface";
import { createTTSProvider } from "./create-tts-provider";

/**
 * Resolves the caller's workspace TtsProviderConfig via
 * TtsProviderConfigService (already wired for masking + AES-256-GCM
 * decryption) and hands back a ready-to-use ITTSProvider. Mirrors
 * AIProviderFactory's exact shape.
 */
@Injectable()
export class TTSProviderFactory {
  constructor(
    private readonly ttsProviderConfigService: TtsProviderConfigService,
  ) {}

  async createForWorkspace(workspaceId: string): Promise<ITTSProvider> {
    const config =
      await this.ttsProviderConfigService.getActiveConfig(workspaceId);

    if (!config) {
      throw new TTSProviderConfigMissingError(workspaceId);
    }

    if (!config.isActive) {
      throw new TTSProviderInactiveError(workspaceId);
    }

    const apiKey =
      await this.ttsProviderConfigService.getDecryptedApiKey(workspaceId);

    if (!apiKey) {
      throw new TTSProviderConfigMissingError(workspaceId);
    }

    return createTTSProvider(config.provider, {
      provider: config.provider,
      apiKey,
      voice: config.voice,
    });
  }
}
