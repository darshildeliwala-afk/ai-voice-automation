import { AIProviderNotImplementedError } from "../errors/ai.errors";
import type { TTSProviderCredentials } from "../interfaces/tts-credentials.interface";
import type {
  ITTSProvider,
  ITTSStream,
  TTSStreamOptions,
} from "../interfaces/tts-provider.interface";

/**
 * Placeholder for OpenAI streaming TTS (Sprint 17). Not implemented this
 * sprint. Swap for a real implementation behind create-tts-provider.ts
 * when ready; no caller of ITTSProvider needs to change.
 */
export class OpenAiTtsProvider implements ITTSProvider {
  constructor(private readonly credentials: TTSProviderCredentials) {
    void this.credentials;
  }

  synthesizeStream(_text: string, _options?: TTSStreamOptions): ITTSStream {
    throw new AIProviderNotImplementedError("OpenAiTtsProvider");
  }
}
