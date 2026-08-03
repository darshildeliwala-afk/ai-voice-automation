export interface SpeechInput {
  text: string;
  /** Provider-specific voice identifier. */
  voice?: string;
}

export interface SpeechResult {
  audio: Buffer;
  contentType: string;
  rawResponse: Record<string, unknown>;
}

/**
 * Abstraction over a single text-to-speech provider. Voice streaming is
 * out of scope for this sprint -- no concrete implementation exists yet;
 * ElevenLabsProvider/CartesiaProvider are placeholders that throw
 * AIProviderNotImplementedError until wired up.
 */
export interface ITTSProvider {
  synthesize(input: SpeechInput): Promise<SpeechResult>;
}
