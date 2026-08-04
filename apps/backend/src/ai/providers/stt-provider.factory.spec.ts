import {
  STTProviderConfigMissingError,
  STTProviderInactiveError,
} from "../errors/ai.errors";
import type { SttProviderConfigService } from "../../workspace-settings/stt-provider-config.service";
import { DeepgramProvider } from "./deepgram.provider";
import { STTProviderFactory } from "./stt-provider.factory";

function setup() {
  const sttProviderConfigService = {
    getActiveConfig: jest.fn(),
    getDecryptedApiKey: jest.fn(),
  };

  const factory = new STTProviderFactory(
    sttProviderConfigService as unknown as SttProviderConfigService,
  );

  return { factory, sttProviderConfigService };
}

describe("STTProviderFactory", () => {
  it("throws STTProviderConfigMissingError when no config exists", async () => {
    const { factory, sttProviderConfigService } = setup();
    sttProviderConfigService.getActiveConfig.mockResolvedValue(null);

    await expect(factory.createForWorkspace("workspace-1")).rejects.toThrow(
      STTProviderConfigMissingError,
    );
  });

  it("throws STTProviderInactiveError when the config is not active", async () => {
    const { factory, sttProviderConfigService } = setup();
    sttProviderConfigService.getActiveConfig.mockResolvedValue({
      provider: "DEEPGRAM",
      language: "en",
      isActive: false,
    });

    await expect(factory.createForWorkspace("workspace-1")).rejects.toThrow(
      STTProviderInactiveError,
    );
  });

  it("throws STTProviderConfigMissingError when the decrypted key is unavailable", async () => {
    const { factory, sttProviderConfigService } = setup();
    sttProviderConfigService.getActiveConfig.mockResolvedValue({
      provider: "DEEPGRAM",
      language: "en",
      isActive: true,
    });
    sttProviderConfigService.getDecryptedApiKey.mockResolvedValue(null);

    await expect(factory.createForWorkspace("workspace-1")).rejects.toThrow(
      STTProviderConfigMissingError,
    );
  });

  it("returns a DeepgramProvider for an active DEEPGRAM config", async () => {
    const { factory, sttProviderConfigService } = setup();
    sttProviderConfigService.getActiveConfig.mockResolvedValue({
      provider: "DEEPGRAM",
      language: "en",
      isActive: true,
    });
    sttProviderConfigService.getDecryptedApiKey.mockResolvedValue("decrypted-key");

    const provider = await factory.createForWorkspace("workspace-1");

    expect(provider).toBeInstanceOf(DeepgramProvider);
  });
});
