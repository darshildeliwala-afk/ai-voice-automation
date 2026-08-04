/** Encoding of the raw audio frames the caller will push via sendAudio(). */
export interface STTStreamOptions {
  /** e.g. 8000 for Plivo's default mulaw stream. */
  sampleRate: number;
  /** e.g. "mulaw" | "linear16". */
  encoding: string;
  language?: string;
  model?: string;
}

export interface STTTranscriptResult {
  text: string;
  /** False for interim/partial results; true once the provider has finalized this utterance. */
  isFinal: boolean;
  confidence?: number;
}

/**
 * A single open streaming session with an STT provider, spanning the
 * duration of a call. MediaSessionService pushes raw audio frames in via
 * sendAudio() as they arrive from Plivo and reacts to transcripts via
 * onTranscript() -- there is no request/response call here, only a
 * continuous duplex stream.
 */
export interface ISTTStream {
  sendAudio(chunk: Buffer): void;
  onTranscript(listener: (result: STTTranscriptResult) => void): void;
  onError(listener: (error: Error) => void): void;
  onClose(listener: () => void): void;
  close(): void;
}

/**
 * Abstraction over a single streaming speech-to-text provider (Sprint 17
 * real-time voice engine). One concrete implementation exists today
 * (DeepgramProvider); WhisperProvider is a placeholder (Whisper's API is
 * batch, not natively streaming) -- adding a real implementation later
 * means adding a class here plus a case in providers/create-stt-provider.ts,
 * with zero changes to any caller.
 */
export interface ISTTProvider {
  startStream(options: STTStreamOptions): ISTTStream;
}
