import OpenAI, {
  APIConnectionTimeoutError,
  AuthenticationError,
  RateLimitError,
} from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import {
  AIInvalidCredentialsError,
  AIProviderApiError,
  AIProviderTimeoutError,
  AIRateLimitError,
} from "../errors/ai.errors";
import type {
  ChatCompletionInput,
  ChatCompletionResult,
  IAIProvider,
} from "../interfaces/ai-provider.interface";
import type { AIProviderCredentials } from "../interfaces/ai-credentials.interface";

const PROVIDER_NAME = "OpenAI";
const DEFAULT_MODEL = "gpt-4o-mini";

function mapOpenAIError(error: unknown): never {
  if (error instanceof AuthenticationError) {
    throw new AIInvalidCredentialsError(PROVIDER_NAME, error);
  }

  if (error instanceof RateLimitError) {
    throw new AIRateLimitError(PROVIDER_NAME);
  }

  if (error instanceof APIConnectionTimeoutError) {
    throw new AIProviderTimeoutError(PROVIDER_NAME);
  }

  const status =
    error && typeof error === "object" && "status" in error
      ? (error as { status?: number }).status
      : undefined;

  throw new AIProviderApiError(PROVIDER_NAME, status, error);
}

export class OpenAIProvider implements IAIProvider {
  private readonly client: OpenAI;
  private readonly credentials: AIProviderCredentials;

  constructor(credentials: AIProviderCredentials) {
    this.credentials = credentials;
    this.client = new OpenAI({ apiKey: credentials.apiKey });
  }

  async chat(input: ChatCompletionInput): Promise<ChatCompletionResult> {
    try {
      const response = await this.client.chat.completions.create({
        model: input.model || this.credentials.defaultModel || DEFAULT_MODEL,
        messages: input.messages as ChatCompletionMessageParam[],
        temperature: input.temperature ?? this.credentials.temperature,
      });

      const choice = response.choices[0];
      const usage = response.usage;

      return {
        content: choice?.message?.content ?? "",
        model: response.model,
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
        rawResponse: response as unknown as Record<string, unknown>,
      };
    } catch (error) {
      mapOpenAIError(error);
    }
  }
}
