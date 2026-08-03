export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionInput {
  /** Falls back to the provider's configured defaultModel when omitted. */
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  rawResponse: Record<string, unknown>;
}

/**
 * Abstraction over a single LLM/chat-completion provider. Only
 * OpenAIProvider is functional today -- ClaudeProvider/GeminiProvider are
 * placeholders (see providers/*.provider.ts). Adding a real
 * implementation for either means swapping the placeholder class for a
 * real one behind AIProviderFactory; no caller of this interface changes.
 */
export interface IAIProvider {
  chat(input: ChatCompletionInput): Promise<ChatCompletionResult>;
}
