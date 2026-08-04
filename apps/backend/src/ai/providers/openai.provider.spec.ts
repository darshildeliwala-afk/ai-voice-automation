const mockCreate = jest.fn();

class FakeAuthenticationError extends Error {
  status = 401;
}
class FakeRateLimitError extends Error {
  status = 429;
}
class FakeAPIConnectionTimeoutError extends Error {}

jest.mock("openai", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
    AuthenticationError: FakeAuthenticationError,
    RateLimitError: FakeRateLimitError,
    APIConnectionTimeoutError: FakeAPIConnectionTimeoutError,
  };
});

// eslint-disable-next-line import/first
import {
  AIInvalidCredentialsError,
  AIProviderApiError,
  AIProviderTimeoutError,
  AIRateLimitError,
} from "../errors/ai.errors";
// eslint-disable-next-line import/first
import type { AIProviderCredentials } from "../interfaces/ai-credentials.interface";
// eslint-disable-next-line import/first
import { OpenAIProvider } from "./openai.provider";

const CREDENTIALS: AIProviderCredentials = {
  provider: "OPENAI" as never,
  apiKey: "sk-test-key",
  defaultModel: "gpt-4o-mini",
  temperature: 0.7,
};

describe("OpenAIProvider", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("sends the messages and returns normalized usage", async () => {
    mockCreate.mockResolvedValue({
      model: "gpt-4o-mini",
      choices: [{ message: { content: "Hello there" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const provider = new OpenAIProvider(CREDENTIALS);
    const result = await provider.chat({
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result).toEqual({
      content: "Hello there",
      model: "gpt-4o-mini",
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      rawResponse: expect.objectContaining({ model: "gpt-4o-mini" }),
    });
  });

  it("falls back to the credentials' defaultModel when no model is given", async () => {
    mockCreate.mockResolvedValue({
      model: "gpt-4o-mini",
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

    const provider = new OpenAIProvider(CREDENTIALS);
    await provider.chat({ messages: [{ role: "user", content: "Hi" }] });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-mini" }),
    );
  });

  it("uses the credentials' temperature when none is given per-request", async () => {
    mockCreate.mockResolvedValue({
      model: "gpt-4o-mini",
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

    const provider = new OpenAIProvider(CREDENTIALS);
    await provider.chat({ messages: [{ role: "user", content: "Hi" }] });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.7 }),
    );
  });

  it("handles a null message content gracefully", async () => {
    mockCreate.mockResolvedValue({
      model: "gpt-4o-mini",
      choices: [{ message: { content: null } }],
      usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
    });

    const provider = new OpenAIProvider(CREDENTIALS);
    const result = await provider.chat({
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.content).toBe("");
  });

  it("maps an AuthenticationError to AIInvalidCredentialsError", async () => {
    mockCreate.mockRejectedValue(new FakeAuthenticationError("bad key"));

    const provider = new OpenAIProvider(CREDENTIALS);

    await expect(
      provider.chat({ messages: [{ role: "user", content: "Hi" }] }),
    ).rejects.toThrow(AIInvalidCredentialsError);
  });

  it("maps a RateLimitError to AIRateLimitError", async () => {
    mockCreate.mockRejectedValue(new FakeRateLimitError("slow down"));

    const provider = new OpenAIProvider(CREDENTIALS);

    await expect(
      provider.chat({ messages: [{ role: "user", content: "Hi" }] }),
    ).rejects.toThrow(AIRateLimitError);
  });

  it("maps an APIConnectionTimeoutError to AIProviderTimeoutError", async () => {
    mockCreate.mockRejectedValue(new FakeAPIConnectionTimeoutError("timeout"));

    const provider = new OpenAIProvider(CREDENTIALS);

    await expect(
      provider.chat({ messages: [{ role: "user", content: "Hi" }] }),
    ).rejects.toThrow(AIProviderTimeoutError);
  });

  it("maps any other failure to AIProviderApiError", async () => {
    mockCreate.mockRejectedValue({ status: 500, message: "boom" });

    const provider = new OpenAIProvider(CREDENTIALS);

    await expect(
      provider.chat({ messages: [{ role: "user", content: "Hi" }] }),
    ).rejects.toThrow(AIProviderApiError);
  });

  describe("tool calling", () => {
    it("passes tool definitions to the API in OpenAI's function-tool shape", async () => {
      mockCreate.mockResolvedValue({
        model: "gpt-4o-mini",
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });

      const provider = new OpenAIProvider(CREDENTIALS);
      await provider.chat({
        messages: [{ role: "user", content: "What's my order status?" }],
        tools: [
          {
            name: "lookup_order",
            description: "Looks up an order",
            parameters: { type: "object", properties: {} },
          },
        ],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              type: "function",
              function: {
                name: "lookup_order",
                description: "Looks up an order",
                parameters: { type: "object", properties: {} },
              },
            },
          ],
        }),
      );
    });

    it("parses tool_calls from the response into ToolCallRequest[]", async () => {
      mockCreate.mockResolvedValue({
        model: "gpt-4o-mini",
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "lookup_order",
                    arguments: '{"orderId":"order-1"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
      });

      const provider = new OpenAIProvider(CREDENTIALS);
      const result = await provider.chat({
        messages: [{ role: "user", content: "What's my order status?" }],
        tools: [
          {
            name: "lookup_order",
            description: "Looks up an order",
            parameters: {},
          },
        ],
      });

      expect(result.content).toBe("");
      expect(result.toolCalls).toEqual([
        { id: "call_1", name: "lookup_order", arguments: { orderId: "order-1" } },
      ]);
    });

    it("parses multiple parallel tool calls from a single response", async () => {
      mockCreate.mockResolvedValue({
        model: "gpt-4o-mini",
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "lookup_customer", arguments: "{}" },
                },
                {
                  id: "call_2",
                  type: "function",
                  function: { name: "lookup_order", arguments: '{"orderId":"o1"}' },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      });

      const provider = new OpenAIProvider(CREDENTIALS);
      const result = await provider.chat({
        messages: [{ role: "user", content: "hi" }],
      });

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls?.map((c) => c.name)).toEqual([
        "lookup_customer",
        "lookup_order",
      ]);
    });

    it("falls back to an empty args object when the model returns invalid JSON arguments", async () => {
      mockCreate.mockResolvedValue({
        model: "gpt-4o-mini",
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "lookup_order", arguments: "{not valid json" },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });

      const provider = new OpenAIProvider(CREDENTIALS);
      const result = await provider.chat({
        messages: [{ role: "user", content: "hi" }],
      });

      expect(result.toolCalls).toEqual([
        { id: "call_1", name: "lookup_order", arguments: {} },
      ]);
    });

    it("omits toolCalls entirely when the model does not request any", async () => {
      mockCreate.mockResolvedValue({
        model: "gpt-4o-mini",
        choices: [{ message: { content: "Just a normal reply" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });

      const provider = new OpenAIProvider(CREDENTIALS);
      const result = await provider.chat({
        messages: [{ role: "user", content: "hi" }],
      });

      expect(result.toolCalls).toBeUndefined();
    });

    it("sends an assistant message with tool_calls and a tool-result message correctly on a follow-up turn", async () => {
      mockCreate.mockResolvedValue({
        model: "gpt-4o-mini",
        choices: [{ message: { content: "Your order ships tomorrow." } }],
        usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
      });

      const provider = new OpenAIProvider(CREDENTIALS);
      await provider.chat({
        messages: [
          { role: "user", content: "What's my order status?" },
          {
            role: "assistant",
            content: "",
            toolCalls: [
              { id: "call_1", name: "lookup_order", arguments: { orderId: "o1" } },
            ],
          },
          {
            role: "tool",
            content: '{"status":"SHIPPED"}',
            toolCallId: "call_1",
          },
        ],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: "user", content: "What's my order status?" },
            {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "lookup_order",
                    arguments: '{"orderId":"o1"}',
                  },
                },
              ],
            },
            {
              role: "tool",
              content: '{"status":"SHIPPED"}',
              tool_call_id: "call_1",
            },
          ],
        }),
      );
    });
  });

  describe("abort signal (barge-in cancellation)", () => {
    it("calls create() with no second argument when no signal is given", async () => {
      mockCreate.mockResolvedValue({
        model: "gpt-4o-mini",
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });

      const provider = new OpenAIProvider(CREDENTIALS);
      await provider.chat({ messages: [{ role: "user", content: "Hi" }] });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate.mock.calls[0]).toHaveLength(1);
    });

    it("passes the signal as create()'s second request-options argument when given", async () => {
      mockCreate.mockResolvedValue({
        model: "gpt-4o-mini",
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
      const controller = new AbortController();

      const provider = new OpenAIProvider(CREDENTIALS);
      await provider.chat({
        messages: [{ role: "user", content: "Hi" }],
        signal: controller.signal,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-4o-mini" }),
        { signal: controller.signal },
      );
    });
  });
});
