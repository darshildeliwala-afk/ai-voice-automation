import { AIProviderNotImplementedError } from "../errors/ai.errors";
import type { AIProviderCredentials } from "../interfaces/ai-credentials.interface";
import type { STTProviderCredentials } from "../interfaces/stt-credentials.interface";
import type { TTSProviderCredentials } from "../interfaces/tts-credentials.interface";
import { CartesiaProvider } from "./cartesia.provider";
import { ClaudeProvider } from "./claude.provider";
import { GeminiProvider } from "./gemini.provider";
import { OpenAiTtsProvider } from "./openai-tts.provider";
import { WhisperProvider } from "./whisper.provider";

const CHAT_CREDENTIALS: AIProviderCredentials = {
  provider: "ANTHROPIC" as never,
  apiKey: "placeholder-key",
  defaultModel: null,
  temperature: 0.7,
};

const STT_CREDENTIALS: STTProviderCredentials = {
  provider: "WHISPER" as never,
  apiKey: "placeholder-key",
  language: "en",
};

const TTS_CREDENTIALS: TTSProviderCredentials = {
  provider: "OPENAI" as never,
  apiKey: "placeholder-key",
  voice: null,
};

describe("placeholder providers", () => {
  it("ClaudeProvider.chat() rejects with AIProviderNotImplementedError", async () => {
    const provider = new ClaudeProvider(CHAT_CREDENTIALS);

    await expect(
      provider.chat({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(AIProviderNotImplementedError);
  });

  it("GeminiProvider.chat() rejects with AIProviderNotImplementedError", async () => {
    const provider = new GeminiProvider(CHAT_CREDENTIALS);

    await expect(
      provider.chat({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(AIProviderNotImplementedError);
  });

  it("WhisperProvider.startStream() throws AIProviderNotImplementedError", () => {
    const provider = new WhisperProvider(STT_CREDENTIALS);

    expect(() => provider.startStream({ sampleRate: 8000, encoding: "mulaw" })).toThrow(
      AIProviderNotImplementedError,
    );
  });

  it("OpenAiTtsProvider.synthesizeStream() throws AIProviderNotImplementedError", () => {
    const provider = new OpenAiTtsProvider(TTS_CREDENTIALS);

    expect(() => provider.synthesizeStream("hello")).toThrow(
      AIProviderNotImplementedError,
    );
  });

  it("CartesiaProvider.synthesizeStream() throws AIProviderNotImplementedError", () => {
    const provider = new CartesiaProvider(TTS_CREDENTIALS);

    expect(() => provider.synthesizeStream("hello")).toThrow(
      AIProviderNotImplementedError,
    );
  });
});
