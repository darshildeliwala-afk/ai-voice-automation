import { AIProviderNotImplementedError } from "../errors/ai.errors";
import type {
  ChatCompletionInput,
  ChatCompletionResult,
  IAIProvider,
} from "../interfaces/ai-provider.interface";
import type { AIProviderCredentials } from "../interfaces/ai-credentials.interface";

/**
 * Placeholder for Google Gemini. Not implemented this sprint -- swap for
 * a real implementation behind AIProviderFactory when ready; no caller of
 * IAIProvider needs to change.
 */
export class GeminiProvider implements IAIProvider {
  constructor(private readonly credentials: AIProviderCredentials) {
    void this.credentials;
  }

  chat(_input: ChatCompletionInput): Promise<ChatCompletionResult> {
    return Promise.reject(new AIProviderNotImplementedError("GeminiProvider"));
  }
}
