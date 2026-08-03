import {
  AIProviderConfigMissingError,
  AIProviderInactiveError,
} from "../errors/ai.errors";
import type { AiProviderConfigService } from "../../workspace-settings/ai-provider-config.service";
import { AIProviderFactory } from "./ai-provider.factory";
import { OpenAIProvider } from "./openai.provider";

function setup() {
  const aiProviderConfigService = {
    getActiveConfig: jest.fn(),
    getDecryptedApiKey: jest.fn(),
  };

  const factory = new AIProviderFactory(
    aiProviderConfigService as unknown as AiProviderConfigService,
  );

  return { factory, aiProviderConfigService };
}

describe("AIProviderFactory", () => {
  it("throws AIProviderConfigMissingError when no config exists", async () => {
    const { factory, aiProviderConfigService } = setup();
    aiProviderConfigService.getActiveConfig.mockResolvedValue(null);

    await expect(factory.createForWorkspace("workspace-1")).rejects.toThrow(
      AIProviderConfigMissingError,
    );
  });

  it("throws AIProviderInactiveError when the config is not active", async () => {
    const { factory, aiProviderConfigService } = setup();
    aiProviderConfigService.getActiveConfig.mockResolvedValue({
      provider: "OPENAI",
      defaultModel: "gpt-4o-mini",
      temperature: 0.7,
      isActive: false,
    });

    await expect(factory.createForWorkspace("workspace-1")).rejects.toThrow(
      AIProviderInactiveError,
    );
  });

  it("throws AIProviderConfigMissingError when the decrypted key is unavailable", async () => {
    const { factory, aiProviderConfigService } = setup();
    aiProviderConfigService.getActiveConfig.mockResolvedValue({
      provider: "OPENAI",
      defaultModel: "gpt-4o-mini",
      temperature: 0.7,
      isActive: true,
    });
    aiProviderConfigService.getDecryptedApiKey.mockResolvedValue(null);

    await expect(factory.createForWorkspace("workspace-1")).rejects.toThrow(
      AIProviderConfigMissingError,
    );
  });

  it("returns an OpenAIProvider for an active OPENAI config", async () => {
    const { factory, aiProviderConfigService } = setup();
    aiProviderConfigService.getActiveConfig.mockResolvedValue({
      provider: "OPENAI",
      defaultModel: "gpt-4o-mini",
      temperature: 0.7,
      isActive: true,
    });
    aiProviderConfigService.getDecryptedApiKey.mockResolvedValue(
      "decrypted-key",
    );

    const provider = await factory.createForWorkspace("workspace-1");

    expect(provider).toBeInstanceOf(OpenAIProvider);
  });
});
