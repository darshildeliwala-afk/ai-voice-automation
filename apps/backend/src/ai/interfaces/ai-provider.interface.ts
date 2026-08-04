export type ChatRole = "system" | "user" | "assistant" | "tool";

/** A single tool invocation the model is requesting. */
export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Present only on role="assistant" messages that requested tool calls. */
  toolCalls?: ToolCallRequest[];
  /** Present only on role="tool" messages -- the ToolCallRequest.id being answered. */
  toolCallId?: string;
}

/** A tool definition offered to the model, in provider-agnostic JSON-Schema form. */
export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatCompletionInput {
  /** Falls back to the provider's configured defaultModel when omitted. */
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  /** Tools the model may call. Omit for a plain, tool-less completion (Sprint 14 behavior). */
  tools?: AIToolDefinition[];
  /** Barge-in hook (Sprint 18): aborts the in-flight call when the customer starts speaking mid-turn. */
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  rawResponse: Record<string, unknown>;
  /** Present (non-empty) only when the model requested one or more tool calls instead of/alongside a text reply. */
  toolCalls?: ToolCallRequest[];
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
