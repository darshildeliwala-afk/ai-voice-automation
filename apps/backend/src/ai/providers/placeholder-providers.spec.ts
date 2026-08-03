import { AIProviderNotImplementedError } from "../errors/ai.errors";
import type { AIProviderCredentials } from "../interfaces/ai-credentials.interface";
import { CartesiaProvider } from "./cartesia.provider";
import { ClaudeProvider } from "./claude.provider";
import { DeepgramProvider } from "./deepgram.provider";
import { ElevenLabsProvider } from "./elevenlabs.provider";
import { GeminiProvider } from "./gemini.provider";
import { WhisperProvider } from "./whisper.provider";

const CREDENTIALS: AIProviderCredentials = {
  provider: "ANTHROPIC" as never,
  apiKey: "placeholder-key",
  defaultModel: null,
  temperature: 0.7,
};

describe("placeholder providers", () => {
  it("ClaudeProvider.chat() rejects with AIProviderNotImplementedError", async () => {
    const provider = new ClaudeProvider(CREDENTIALS);

    await expect(
      provider.chat({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(AIProviderNotImplementedError);
  });

  it("GeminiProvider.chat() rejects with AIProviderNotImplementedError", async () => {
    const provider = new GeminiProvider(CREDENTIALS);

    await expect(
      provider.chat({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(AIProviderNotImplementedError);
  });

  it("DeepgramProvider.transcribe() rejects with AIProviderNotImplementedError", async () => {
    const provider = new DeepgramProvider();

    await expect(
      provider.transcribe({ audio: Buffer.from(""), contentType: "audio/wav" }),
    ).rejects.toThrow(AIProviderNotImplementedError);
  });

  it("WhisperProvider.transcribe() rejects with AIProviderNotImplementedError", async () => {
    const provider = new WhisperProvider();

    await expect(
      provider.transcribe({ audio: Buffer.from(""), contentType: "audio/wav" }),
    ).rejects.toThrow(AIProviderNotImplementedError);
  });

  it("ElevenLabsProvider.synthesize() rejects with AIProviderNotImplementedError", async () => {
    const provider = new ElevenLabsProvider();

    await expect(provider.synthesize({ text: "hello" })).rejects.toThrow(
      AIProviderNotImplementedError,
    );
  });

  it("CartesiaProvider.synthesize() rejects with AIProviderNotImplementedError", async () => {
    const provider = new CartesiaProvider();

    await expect(provider.synthesize({ text: "hello" })).rejects.toThrow(
      AIProviderNotImplementedError,
    );
  });
});
