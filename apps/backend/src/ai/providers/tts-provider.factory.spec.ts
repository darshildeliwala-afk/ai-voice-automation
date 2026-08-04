import {
  TTSProviderConfigMissingError,
  TTSProviderInactiveError,
} from "../errors/ai.errors";
import type { TtsProviderConfigService } from "../../workspace-settings/tts-provider-config.service";
import { ElevenLabsProvider } from "./elevenlabs.provider";
import { TTSProviderFactory } from "./tts-provider.factory";

function setup() {
  const ttsProviderConfigService = {
    getActiveConfig: jest.fn(),
    getDecryptedApiKey: jest.fn(),
  };

  const factory = new TTSProviderFactory(
    ttsProviderConfigService as unknown as TtsProviderConfigService,
  );

  return { factory, ttsProviderConfigService };
}

describe("TTSProviderFactory", () => {
  it("throws TTSProviderConfigMissingError when no config exists", async () => {
    const { factory, ttsProviderConfigService } = setup();
    ttsProviderConfigService.getActiveConfig.mockResolvedValue(null);

    await expect(factory.createForWorkspace("workspace-1")).rejects.toThrow(
      TTSProviderConfigMissingError,
    );
  });

  it("throws TTSProviderInactiveError when the config is not active", async () => {
    const { factory, ttsProviderConfigService } = setup();
    ttsProviderConfigService.getActiveConfig.mockResolvedValue({
      provider: "ELEVENLABS",
      voice: null,
      isActive: false,
    });

    await expect(factory.createForWorkspace("workspace-1")).rejects.toThrow(
      TTSProviderInactiveError,
    );
  });

  it("throws TTSProviderConfigMissingError when the decrypted key is unavailable", async () => {
    const { factory, ttsProviderConfigService } = setup();
    ttsProviderConfigService.getActiveConfig.mockResolvedValue({
      provider: "ELEVENLABS",
      voice: null,
      isActive: true,
    });
    ttsProviderConfigService.getDecryptedApiKey.mockResolvedValue(null);

    await expect(factory.createForWorkspace("workspace-1")).rejects.toThrow(
      TTSProviderConfigMissingError,
    );
  });

  it("returns an ElevenLabsProvider for an active ELEVENLABS config", async () => {
    const { factory, ttsProviderConfigService } = setup();
    ttsProviderConfigService.getActiveConfig.mockResolvedValue({
      provider: "ELEVENLABS",
      voice: "rachel",
      isActive: true,
    });
    ttsProviderConfigService.getDecryptedApiKey.mockResolvedValue("decrypted-key");

    const provider = await factory.createForWorkspace("workspace-1");

    expect(provider).toBeInstanceOf(ElevenLabsProvider);
  });
});
