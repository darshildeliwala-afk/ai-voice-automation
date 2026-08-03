import { AiProvider } from "../../generated/prisma/client";
import { AIProviderNotImplementedError } from "../errors/ai.errors";
import type { AIProviderCredentials } from "../interfaces/ai-credentials.interface";
import { ClaudeProvider } from "./claude.provider";
import { GeminiProvider } from "./gemini.provider";
import { OpenAIProvider } from "./openai.provider";
import { createAIProvider } from "./provider.factory";

function credentials(provider: AiProvider): AIProviderCredentials {
  return { provider, apiKey: "key", defaultModel: null, temperature: 0.7 };
}

describe("createAIProvider", () => {
  it("returns an OpenAIProvider for OPENAI", () => {
    const provider = createAIProvider(AiProvider.OPENAI, credentials(AiProvider.OPENAI));
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  it("returns a ClaudeProvider for ANTHROPIC", () => {
    const provider = createAIProvider(
      AiProvider.ANTHROPIC,
      credentials(AiProvider.ANTHROPIC),
    );
    expect(provider).toBeInstanceOf(ClaudeProvider);
  });

  it("returns a GeminiProvider for GOOGLE", () => {
    const provider = createAIProvider(AiProvider.GOOGLE, credentials(AiProvider.GOOGLE));
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it("throws AIProviderNotImplementedError for AZURE_OPENAI", () => {
    expect(() =>
      createAIProvider(AiProvider.AZURE_OPENAI, credentials(AiProvider.AZURE_OPENAI)),
    ).toThrow(AIProviderNotImplementedError);
  });
});
