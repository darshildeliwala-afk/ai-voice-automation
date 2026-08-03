import { AiProvider } from "../../generated/prisma/client";
import type { AIProviderCredentials } from "../interfaces/ai-credentials.interface";
import type { IAIProvider } from "../interfaces/ai-provider.interface";
import { AIProviderNotImplementedError } from "../errors/ai.errors";
import { ClaudeProvider } from "./claude.provider";
import { GeminiProvider } from "./gemini.provider";
import { OpenAIProvider } from "./openai.provider";

/**
 * Provider-agnostic dispatch point for chat/completion providers. Adding a
 * real Claude/Gemini implementation later means swapping the placeholder
 * class in the corresponding case -- no caller of this factory changes.
 */
export function createAIProvider(
  provider: AiProvider,
  credentials: AIProviderCredentials,
): IAIProvider {
  switch (provider) {
    case AiProvider.OPENAI:
      return new OpenAIProvider(credentials);
    case AiProvider.ANTHROPIC:
      return new ClaudeProvider(credentials);
    case AiProvider.GOOGLE:
      return new GeminiProvider(credentials);
    case AiProvider.AZURE_OPENAI:
      throw new AIProviderNotImplementedError("AzureOpenAIProvider");
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unsupported AI provider: ${exhaustiveCheck}`);
    }
  }
}
