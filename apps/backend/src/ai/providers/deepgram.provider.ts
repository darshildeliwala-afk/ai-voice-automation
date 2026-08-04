import { STTConnectionError } from "../errors/ai.errors";
import type { STTProviderCredentials } from "../interfaces/stt-credentials.interface";
import type {
  ISTTProvider,
  ISTTStream,
  STTStreamOptions,
  STTTranscriptResult,
} from "../interfaces/stt-provider.interface";

// `ws` is a CommonJS `export =` module (no esModuleInterop here). Its
// declaration-merged .d.ts (class + interface + namespace all named
// `WebSocket`) resolves inconsistently across our two TS toolchains (tsc
// via `nest build` vs ts-jest) when imported via `import`/`import =` --
// constructable under one, a bare namespace under the other. A plain
// `require()` call is untouched by either toolchain's import-transform
// layer, so it behaves identically everywhere (and is what jest.mock
// actually patches). Re-declare the minimal shape we actually use locally
// and cast once, the same pattern plivo.provider.ts (telephony-core) uses
// for `plivo.Response`.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WSModule: unknown = require("ws");

interface RawWebSocketClient {
  readonly readyState: number;
  on(event: "message", listener: (data: Buffer) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: () => void): void;
  send(data: Buffer): void;
  close(): void;
}

interface RawWebSocketConstructor {
  new (
    url: string,
    options: { headers: Record<string, string> },
  ): RawWebSocketClient;
  readonly CONNECTING: number;
  readonly OPEN: number;
}

const RawWebSocket = WSModule as unknown as RawWebSocketConstructor;

const DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen";
const DEFAULT_MODEL = "nova-2";

interface DeepgramMessage {
  channel?: {
    alternatives?: Array<{ transcript?: string; confidence?: number }>;
  };
  is_final?: boolean;
  speech_final?: boolean;
}

function buildUrl(options: STTStreamOptions, credentials: STTProviderCredentials): string {
  const params = new URLSearchParams({
    encoding: options.encoding,
    sample_rate: String(options.sampleRate),
    language: options.language ?? credentials.language ?? "en",
    model: options.model ?? DEFAULT_MODEL,
    punctuate: "true",
    interim_results: "true",
    endpointing: "300",
  });

  return `${DEEPGRAM_WS_URL}?${params.toString()}`;
}

class DeepgramStream implements ISTTStream {
  private readonly ws: RawWebSocketClient;
  private readonly transcriptListeners: Array<(result: STTTranscriptResult) => void> = [];
  private readonly errorListeners: Array<(error: Error) => void> = [];
  private readonly closeListeners: Array<() => void> = [];

  constructor(credentials: STTProviderCredentials, options: STTStreamOptions) {
    this.ws = new RawWebSocket(buildUrl(options, credentials), {
      headers: { Authorization: `Token ${credentials.apiKey}` },
    });

    this.ws.on("message", (data) => this.handleMessage(data));
    this.ws.on("error", (error) => {
      const wrapped = new STTConnectionError("Deepgram", error);
      this.errorListeners.forEach((listener) => listener(wrapped));
    });
    this.ws.on("close", () => this.closeListeners.forEach((listener) => listener()));
  }

  private handleMessage(data: Buffer): void {
    let parsed: DeepgramMessage;
    try {
      parsed = JSON.parse(data.toString()) as DeepgramMessage;
    } catch {
      // Non-JSON / unrecognized message (e.g. a keepalive ack) -- ignore
      // rather than crash the stream over a message we don't understand.
      return;
    }

    const alternative = parsed.channel?.alternatives?.[0];
    if (!alternative?.transcript) {
      return;
    }

    const result: STTTranscriptResult = {
      text: alternative.transcript,
      isFinal: Boolean(parsed.is_final || parsed.speech_final),
      confidence: alternative.confidence,
    };

    this.transcriptListeners.forEach((listener) => listener(result));
  }

  sendAudio(chunk: Buffer): void {
    if (this.ws.readyState === RawWebSocket.OPEN) {
      this.ws.send(chunk);
    }
  }

  onTranscript(listener: (result: STTTranscriptResult) => void): void {
    this.transcriptListeners.push(listener);
  }

  onError(listener: (error: Error) => void): void {
    this.errorListeners.push(listener);
  }

  onClose(listener: () => void): void {
    this.closeListeners.push(listener);
  }

  close(): void {
    if (
      this.ws.readyState === RawWebSocket.OPEN ||
      this.ws.readyState === RawWebSocket.CONNECTING
    ) {
      this.ws.close();
    }
  }
}

/**
 * Streaming STT via Deepgram's real-time WS API. One DeepgramStream spans
 * the whole call -- MediaSessionService opens it once (on the media
 * session's `start` event) and pushes every subsequent audio frame into
 * the same connection, rather than reconnecting per utterance.
 */
export class DeepgramProvider implements ISTTProvider {
  constructor(private readonly credentials: STTProviderCredentials) {}

  startStream(options: STTStreamOptions): ISTTStream {
    return new DeepgramStream(this.credentials, options);
  }
}
