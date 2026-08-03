import { AIProviderNotImplementedError } from "../errors/ai.errors";
import type {
  ISTTProvider,
  TranscriptionInput,
  TranscriptionResult,
} from "../interfaces/stt-provider.interface";

/**
 * Placeholder for Deepgram speech-to-text. Voice streaming (and therefore
 * any real STT integration) is out of scope for this sprint.
 */
export class DeepgramProvider implements ISTTProvider {
  transcribe(_input: TranscriptionInput): Promise<TranscriptionResult> {
    return Promise.reject(
      new AIProviderNotImplementedError("DeepgramProvider"),
    );
  }
}
