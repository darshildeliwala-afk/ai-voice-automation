import { TtsProvider } from "../../generated/prisma/client";
import type { TTSProviderCredentials } from "../interfaces/tts-credentials.interface";
import { CartesiaProvider } from "./cartesia.provider";
import { createTTSProvider } from "./create-tts-provider";
import { ElevenLabsProvider } from "./elevenlabs.provider";
import { OpenAiTtsProvider } from "./openai-tts.provider";

function credentials(provider: TtsProvider): TTSProviderCredentials {
  return { provider, apiKey: "key", voice: null };
}

describe("createTTSProvider", () => {
  it("returns an ElevenLabsProvider for ELEVENLABS", () => {
    const provider = createTTSProvider(TtsProvider.ELEVENLABS, credentials(TtsProvider.ELEVENLABS));
    expect(provider).toBeInstanceOf(ElevenLabsProvider);
  });

  it("returns an OpenAiTtsProvider for OPENAI", () => {
    const provider = createTTSProvider(TtsProvider.OPENAI, credentials(TtsProvider.OPENAI));
    expect(provider).toBeInstanceOf(OpenAiTtsProvider);
  });

  it("returns a CartesiaProvider for CARTESIA", () => {
    const provider = createTTSProvider(TtsProvider.CARTESIA, credentials(TtsProvider.CARTESIA));
    expect(provider).toBeInstanceOf(CartesiaProvider);
  });
});
