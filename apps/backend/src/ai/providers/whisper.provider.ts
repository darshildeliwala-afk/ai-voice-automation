import { AIProviderNotImplementedError } from "../errors/ai.errors";
import type { STTProviderCredentials } from "../interfaces/stt-credentials.interface";
import type {
  ISTTProvider,
  ISTTStream,
  STTStreamOptions,
} from "../interfaces/stt-provider.interface";

/**
 * Placeholder for Whisper streaming STT (Sprint 17). Not implemented this
 * sprint -- OpenAI's Whisper API is not natively streaming (batch
 * transcription of complete audio), so a real implementation needs a
 * chunking/buffering strategy this sprint doesn't scope. Swap for a real
 * implementation behind create-stt-provider.ts when ready; no caller of
 * ISTTProvider needs to change.
 */
export class WhisperProvider implements ISTTProvider {
  constructor(private readonly credentials: STTProviderCredentials) {
    void this.credentials;
  }

  startStream(_options: STTStreamOptions): ISTTStream {
    throw new AIProviderNotImplementedError("WhisperProvider");
  }
}
