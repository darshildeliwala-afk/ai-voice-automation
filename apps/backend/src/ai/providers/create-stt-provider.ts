import { SttProvider } from "../../generated/prisma/client";
import type { STTProviderCredentials } from "../interfaces/stt-credentials.interface";
import type { ISTTProvider } from "../interfaces/stt-provider.interface";
import { DeepgramProvider } from "./deepgram.provider";
import { WhisperProvider } from "./whisper.provider";

/**
 * Provider-agnostic dispatch point for streaming STT providers, mirroring
 * provider.factory.ts's createAIProvider(). Adding a real Whisper
 * implementation later means swapping the placeholder class here -- no
 * caller of this factory changes.
 */
export function createSTTProvider(
  provider: SttProvider,
  credentials: STTProviderCredentials,
): ISTTProvider {
  switch (provider) {
    case SttProvider.DEEPGRAM:
      return new DeepgramProvider(credentials);
    case SttProvider.WHISPER:
      return new WhisperProvider(credentials);
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unsupported STT provider: ${exhaustiveCheck}`);
    }
  }
}
