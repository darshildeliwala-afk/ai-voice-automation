export interface TranscriptionInput {
  /** Raw audio bytes. Codec/format is provider-specific. */
  audio: Buffer;
  /** MIME type of the audio, e.g. "audio/wav", "audio/mpeg". */
  contentType: string;
  /** BCP-47 language hint, if known. */
  language?: string;
}

export interface TranscriptionResult {
  text: string;
  language: string | null;
  rawResponse: Record<string, unknown>;
}

/**
 * Abstraction over a single speech-to-text provider. Voice streaming is
 * out of scope for this sprint -- no concrete implementation exists yet;
 * DeepgramProvider/WhisperProvider are placeholders that throw
 * AIProviderNotImplementedError until wired up.
 */
export interface ISTTProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}
