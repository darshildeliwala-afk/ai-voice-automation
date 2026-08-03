import { Injectable } from "@nestjs/common";

import { AiProviderConfigService } from "../../workspace-settings/ai-provider-config.service";
import {
  AIProviderConfigMissingError,
  AIProviderInactiveError,
} from "../errors/ai.errors";
import type { IAIProvider } from "../interfaces/ai-provider.interface";
import { createAIProvider } from "./provider.factory";

/**
 * Resolves the caller's workspace AiProviderConfig via the existing
 * AiProviderConfigService/EncryptionService (already wired for masking +
 * AES-256-GCM decryption) and hands back a ready-to-use IAIProvider. This
 * is the only place apps/backend constructs an AI provider instance --
 * callers never touch credentials or a concrete provider class directly.
 */
@Injectable()
export class AIProviderFactory {
  constructor(
    private readonly aiProviderConfigService: AiProviderConfigService,
  ) {}

  async createForWorkspace(workspaceId: string): Promise<IAIProvider> {
    const config =
      await this.aiProviderConfigService.getActiveConfig(workspaceId);

    if (!config) {
      throw new AIProviderConfigMissingError(workspaceId);
    }

    if (!config.isActive) {
      throw new AIProviderInactiveError(workspaceId);
    }

    const apiKey =
      await this.aiProviderConfigService.getDecryptedApiKey(workspaceId);

    if (!apiKey) {
      throw new AIProviderConfigMissingError(workspaceId);
    }

    return createAIProvider(config.provider, {
      provider: config.provider,
      apiKey,
      defaultModel: config.defaultModel,
      temperature: config.temperature,
    });
  }
}
