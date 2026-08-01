import { Injectable } from "@nestjs/common";
import {
  createCallProvider,
  TelephonyConfigMissingError,
  TelephonyProviderInactiveError,
  type ICallProvider,
  type SupportedTelephonyProvider,
} from "@ai-voice-automation/telephony-core";

import { TelephonyConfigService } from "../../workspace-settings/telephony-config.service";

/**
 * Resolves the caller's workspace TelephonyConfig via the existing
 * TelephonyConfigService/EncryptionService (already wired for masking +
 * AES-256-GCM decryption) and hands back a ready-to-use ICallProvider from
 * the shared @ai-voice-automation/telephony-core package. This is the only
 * place apps/backend constructs a provider instance -- callers never touch
 * credentials or a concrete provider class directly.
 */
@Injectable()
export class TelephonyProviderFactory {
  constructor(private readonly telephonyConfigService: TelephonyConfigService) {}

  async createForWorkspace(workspaceId: string): Promise<ICallProvider> {
    const config = await this.telephonyConfigService.getActiveConfig(
      workspaceId,
    );

    if (!config) {
      throw new TelephonyConfigMissingError(workspaceId);
    }

    if (!config.isActive) {
      throw new TelephonyProviderInactiveError(workspaceId);
    }

    if (!config.authId || !config.phoneNumber) {
      throw new TelephonyConfigMissingError(workspaceId);
    }

    const authToken = await this.telephonyConfigService.getDecryptedAuthToken(
      workspaceId,
    );

    if (!authToken) {
      throw new TelephonyConfigMissingError(workspaceId);
    }

    return createCallProvider(
      config.provider as SupportedTelephonyProvider,
      {
        provider: config.provider as SupportedTelephonyProvider,
        authId: config.authId,
        authToken,
        phoneNumber: config.phoneNumber,
      },
    );
  }
}
