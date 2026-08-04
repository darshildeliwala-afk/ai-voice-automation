import OpenAI, {
  APIConnectionTimeoutError,
  AuthenticationError,
  RateLimitError,
} from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import {
  AIInvalidCredentialsError,
  AIProviderApiError,
  AIProviderTimeoutError,
  AIRateLimitError,
} from "../errors/ai.errors";
import type {
  ChatCompletionInput,
  ChatCompletionResult,
  ChatMessage,
  IAIProvider,
  ToolCallRequest,
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

function toOpenAIMessage(message: ChatMessage): ChatCompletionMessageParam {
  switch (message.role) {
    case "tool":
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.toolCallId ?? "",
      };
    case "assistant":
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls?.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: {
            name: call.name,
            arguments: JSON.stringify(call.arguments),
          },
        })),
      };
    case "system":
      return { role: "system", content: message.content };
    case "user":
    default:
      return { role: "user", content: message.content };
  }
}

function toOpenAITool(name: string, description: string, parameters: Record<string, unknown>): ChatCompletionTool {
  return {
    type: "function",
    function: { name, description, parameters },
  };
}

function parseToolCalls(
  toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] | undefined,
): ToolCallRequest[] | undefined {
  if (!toolCalls || toolCalls.length === 0) {
    return undefined;
  }

  return toolCalls
    .filter(
      (call): call is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
        call.type === "function",
    )
    .map((call) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments) as Record<string, unknown>;
      } catch {
        // The model does not always generate valid JSON -- fall back to an
        // empty args object rather than crash the whole conversation turn;
        // the tool itself is responsible for validating what it receives.
        args = {};
      }

      return { id: call.id, name: call.function.name, arguments: args };
    });
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
      const body = {
        model: input.model || this.credentials.defaultModel || DEFAULT_MODEL,
        messages: input.messages.map(toOpenAIMessage),
        temperature: input.temperature ?? this.credentials.temperature,
        tools: input.tools?.map((tool) =>
          toOpenAITool(tool.name, tool.description, tool.parameters),
        ),
      };

      // Only pass a second request-options argument when a signal is
      // actually present, so a call with no signal keeps today's exact
      // one-argument call shape (barge-in cancellation, Sprint 18).
      const response = input.signal
        ? await this.client.chat.completions.create(body, {
            signal: input.signal,
          })
        : await this.client.chat.completions.create(body);

      const choice = response.choices[0];
      const usage = response.usage;

      return {
        content: choice?.message?.content ?? "",
        model: response.model,
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
        rawResponse: response as unknown as Record<string, unknown>,
        toolCalls: parseToolCalls(choice?.message?.tool_calls),
      };
    } catch (error) {
      mapOpenAIError(error);
    }
  }
}
