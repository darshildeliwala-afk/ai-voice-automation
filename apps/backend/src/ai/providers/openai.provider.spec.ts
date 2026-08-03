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
});
