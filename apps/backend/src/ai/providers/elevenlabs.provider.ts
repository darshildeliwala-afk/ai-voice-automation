import { TTSSynthesisError } from "../errors/ai.errors";
import type { TTSProviderCredentials } from "../interfaces/tts-credentials.interface";
import type {
  ITTSProvider,
  ITTSStream,
  TTSStreamOptions,
} from "../interfaces/tts-provider.interface";

const ELEVENLABS_STREAM_URL = (voiceId: string) =>
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;
const DEFAULT_MODEL_ID = "eleven_turbo_v2";
/** ElevenLabs' well-known public "Rachel" voice -- used only when neither the call nor the workspace config specifies one. */
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

class ElevenLabsStream implements ITTSStream {
  private readonly audioChunkListeners: Array<(chunk: Buffer) => void> = [];
  private readonly endListeners: Array<() => void> = [];
  private readonly errorListeners: Array<(error: Error) => void> = [];
  private readonly abortController = new AbortController();
  private cancelled = false;

  constructor(
    credentials: TTSProviderCredentials,
    text: string,
    options?: TTSStreamOptions,
  ) {
    void this.run(credentials, text, options);
  }

  private async run(
    credentials: TTSProviderCredentials,
    text: string,
    options?: TTSStreamOptions,
  ): Promise<void> {
    try {
      const voiceId = options?.voice ?? credentials.voice ?? DEFAULT_VOICE_ID;

      // Generic persona knobs (Sprint 18) mapped into ElevenLabs' own
      // voice_settings shape -- only included when at least one is
      // present, so a plain synthesizeStream(text) call keeps sending
      // exactly the same body it always has. `pitch` has no ElevenLabs
      // voice_settings equivalent today (see TTSStreamOptions) and is
      // intentionally not mapped.
      const voiceSettings: Record<string, number> = {};
      if (options?.speakingRate !== undefined) voiceSettings.speed = options.speakingRate;
      if (options?.warmth !== undefined) voiceSettings.style = options.warmth;

      const response = await fetch(ELEVENLABS_STREAM_URL(voiceId), {
        method: "POST",
        headers: {
          "xi-api-key": credentials.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: DEFAULT_MODEL_ID,
          ...(Object.keys(voiceSettings).length > 0 ? { voice_settings: voiceSettings } : {}),
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new TTSSynthesisError(
          "ElevenLabs",
          new Error(`HTTP ${response.status}`),
        );
      }

      for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
        if (this.cancelled) {
          break;
        }
        this.emitChunk(Buffer.from(chunk));
      }

      if (!this.cancelled) {
        this.endListeners.forEach((listener) => listener());
      }
    } catch (error) {
      if (this.cancelled) {
        // Expected: cancel() aborts the in-flight fetch, which rejects
        // with an AbortError -- not a real failure to report.
        return;
      }

      const wrapped =
        error instanceof TTSSynthesisError
          ? error
          : new TTSSynthesisError("ElevenLabs", error);
      this.errorListeners.forEach((listener) => listener(wrapped));
    }
  }

  private emitChunk(chunk: Buffer): void {
    this.audioChunkListeners.forEach((listener) => listener(chunk));
  }

  onAudioChunk(listener: (chunk: Buffer) => void): void {
    this.audioChunkListeners.push(listener);
  }

  onEnd(listener: () => void): void {
    this.endListeners.push(listener);
  }

  onError(listener: (error: Error) => void): void {
    this.errorListeners.push(listener);
  }

  cancel(): void {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    this.abortController.abort();
  }
}

/**
 * Streaming TTS via ElevenLabs' chunked HTTP streaming endpoint. Each
 * synthesizeStream() call is independent (unlike DeepgramProvider's one
 * connection per call) -- MediaSessionService opens a new stream per AI
 * turn and cancel()s it immediately on barge-in.
 */
export class ElevenLabsProvider implements ITTSProvider {
  constructor(private readonly credentials: TTSProviderCredentials) {}

  synthesizeStream(text: string, options?: TTSStreamOptions): ITTSStream {
    return new ElevenLabsStream(this.credentials, text, options);
  }
}
