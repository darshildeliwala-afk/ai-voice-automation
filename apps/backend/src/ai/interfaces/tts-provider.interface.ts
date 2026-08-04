export interface TTSStreamOptions {
  /** Provider-specific voice identifier. */
  voice?: string;
  /** e.g. 8000 to match Plivo's default mulaw stream. */
  sampleRate?: number;
  /** e.g. "mulaw" | "linear16". */
  encoding?: string;
}

/**
 * A single in-flight speech synthesis. Chunks arrive as they're generated
 * (not as one buffered blob) so MediaSessionService can start streaming
 * audio back to Plivo before the whole utterance has finished synthesizing.
 * cancel() is the barge-in hook -- stops emitting further chunks the
 * moment the customer starts talking over playback.
 */
export interface ITTSStream {
  onAudioChunk(listener: (chunk: Buffer) => void): void;
  onEnd(listener: () => void): void;
  onError(listener: (error: Error) => void): void;
  cancel(): void;
}

/**
 * Abstraction over a single streaming text-to-speech provider (Sprint 17
 * real-time voice engine). One concrete implementation exists today
 * (ElevenLabsProvider); OpenAiTtsProvider/CartesiaProvider are
 * placeholders -- adding a real implementation later means adding a class
 * here plus a case in providers/create-tts-provider.ts, with zero changes
 * to any caller.
 */
export interface ITTSProvider {
  synthesizeStream(text: string, options?: TTSStreamOptions): ITTSStream;
}
