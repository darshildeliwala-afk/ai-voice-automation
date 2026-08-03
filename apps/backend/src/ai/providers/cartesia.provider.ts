import { AIProviderNotImplementedError } from "../errors/ai.errors";
import type {
  ITTSProvider,
  SpeechInput,
  SpeechResult,
} from "../interfaces/tts-provider.interface";

/**
 * Placeholder for Cartesia text-to-speech. Voice streaming (and therefore
 * any real TTS integration) is out of scope for this sprint.
 */
export class CartesiaProvider implements ITTSProvider {
  synthesize(_input: SpeechInput): Promise<SpeechResult> {
    return Promise.reject(
      new AIProviderNotImplementedError("CartesiaProvider"),
    );
  }
}
