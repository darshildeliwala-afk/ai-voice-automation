import { TtsProvider } from "../../generated/prisma/client";
import type { TTSProviderCredentials } from "../interfaces/tts-credentials.interface";
import type { ITTSProvider } from "../interfaces/tts-provider.interface";
import { CartesiaProvider } from "./cartesia.provider";
import { ElevenLabsProvider } from "./elevenlabs.provider";
import { OpenAiTtsProvider } from "./openai-tts.provider";

/**
 * Provider-agnostic dispatch point for streaming TTS providers, mirroring
 * provider.factory.ts's createAIProvider(). Adding real OpenAI/Cartesia
 * implementations later means swapping the placeholder classes here -- no
 * caller of this factory changes.
 */
export function createTTSProvider(
  provider: TtsProvider,
  credentials: TTSProviderCredentials,
): ITTSProvider {
  switch (provider) {
    case TtsProvider.ELEVENLABS:
      return new ElevenLabsProvider(credentials);
    case TtsProvider.OPENAI:
      return new OpenAiTtsProvider(credentials);
    case TtsProvider.CARTESIA:
      return new CartesiaProvider(credentials);
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unsupported TTS provider: ${exhaustiveCheck}`);
    }
  }
}
