import { SttProvider } from "../../generated/prisma/client";
import type { STTProviderCredentials } from "../interfaces/stt-credentials.interface";
import { createSTTProvider } from "./create-stt-provider";
import { DeepgramProvider } from "./deepgram.provider";
import { WhisperProvider } from "./whisper.provider";

function credentials(provider: SttProvider): STTProviderCredentials {
  return { provider, apiKey: "key", language: "en" };
}

describe("createSTTProvider", () => {
  it("returns a DeepgramProvider for DEEPGRAM", () => {
    const provider = createSTTProvider(SttProvider.DEEPGRAM, credentials(SttProvider.DEEPGRAM));
    expect(provider).toBeInstanceOf(DeepgramProvider);
  });

  it("returns a WhisperProvider for WHISPER", () => {
    const provider = createSTTProvider(SttProvider.WHISPER, credentials(SttProvider.WHISPER));
    expect(provider).toBeInstanceOf(WhisperProvider);
  });
});
