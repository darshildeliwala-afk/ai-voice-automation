import { STTConnectionError } from "../errors/ai.errors";
import { DeepgramProvider } from "./deepgram.provider";

interface FakeWebSocketInstance {
  readyState: number;
  url: string;
  options: unknown;
  send: jest.Mock;
  close: jest.Mock;
  emit(event: string, ...args: unknown[]): void;
}

interface FakeWebSocketModule {
  OPEN: number;
  CONNECTING: number;
  CLOSING: number;
  CLOSED: number;
  instances: FakeWebSocketInstance[];
}

jest.mock("ws", () => {
  class FakeWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSING = 2;
    static CLOSED = 3;
    static instances: FakeWebSocket[] = [];

    readyState = FakeWebSocket.OPEN;
    url: string;
    options: unknown;
    send = jest.fn();
    close = jest.fn();
    private readonly listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

    constructor(url: string, options: unknown) {
      this.url = url;
      this.options = options;
      FakeWebSocket.instances.push(this);
    }

    on(event: string, cb: (...args: unknown[]) => void): this {
      (this.listeners[event] ??= []).push(cb);
      return this;
    }

    emit(event: string, ...args: unknown[]): void {
      (this.listeners[event] ?? []).forEach((cb) => cb(...args));
    }
  }

  return FakeWebSocket;
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const FakeWebSocket: FakeWebSocketModule = require("ws");

function lastInstance(): FakeWebSocketInstance {
  const instance = FakeWebSocket.instances.at(-1);
  if (!instance) {
    throw new Error("No FakeWebSocket instance was created");
  }
  return instance;
}

function startStream() {
  const provider = new DeepgramProvider({
    provider: "DEEPGRAM" as never,
    apiKey: "dg-key",
    language: "en",
  });
  return provider.startStream({ sampleRate: 8000, encoding: "mulaw" });
}

describe("DeepgramProvider", () => {
  beforeEach(() => {
    FakeWebSocket.instances.length = 0;
  });

  it("opens a WS connection to Deepgram with the API key as an Authorization header", () => {
    startStream();

    const instance = lastInstance();
    expect(instance.url).toContain("wss://api.deepgram.com/v1/listen");
    expect(instance.url).toContain("sample_rate=8000");
    expect(instance.url).toContain("encoding=mulaw");
    expect(instance.options).toEqual({ headers: { Authorization: "Token dg-key" } });
  });

  it("emits a final transcript result when Deepgram reports is_final", () => {
    const stream = startStream();
    const onTranscript = jest.fn();
    stream.onTranscript(onTranscript);

    lastInstance().emit(
      "message",
      Buffer.from(
        JSON.stringify({
          channel: { alternatives: [{ transcript: "hello world", confidence: 0.95 }] },
          is_final: true,
        }),
      ),
    );

    expect(onTranscript).toHaveBeenCalledWith({
      text: "hello world",
      isFinal: true,
      confidence: 0.95,
    });
  });

  it("emits a partial (isFinal: false) transcript for interim results", () => {
    const stream = startStream();
    const onTranscript = jest.fn();
    stream.onTranscript(onTranscript);

    lastInstance().emit(
      "message",
      Buffer.from(
        JSON.stringify({
          channel: { alternatives: [{ transcript: "hello", confidence: 0.5 }] },
          is_final: false,
        }),
      ),
    );

    expect(onTranscript).toHaveBeenCalledWith({
      text: "hello",
      isFinal: false,
      confidence: 0.5,
    });
  });

  it("treats speech_final as equivalent to is_final", () => {
    const stream = startStream();
    const onTranscript = jest.fn();
    stream.onTranscript(onTranscript);

    lastInstance().emit(
      "message",
      Buffer.from(
        JSON.stringify({
          channel: { alternatives: [{ transcript: "done" }] },
          speech_final: true,
        }),
      ),
    );

    expect(onTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ text: "done", isFinal: true }),
    );
  });

  it("ignores non-JSON messages without throwing", () => {
    const stream = startStream();
    const onTranscript = jest.fn();
    stream.onTranscript(onTranscript);

    expect(() => lastInstance().emit("message", Buffer.from("not json"))).not.toThrow();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("ignores messages with no transcript alternative", () => {
    const stream = startStream();
    const onTranscript = jest.fn();
    stream.onTranscript(onTranscript);

    lastInstance().emit("message", Buffer.from(JSON.stringify({ type: "Metadata" })));

    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("forwards sendAudio() as a raw WS send while the socket is OPEN", () => {
    const stream = startStream();
    const chunk = Buffer.from([1, 2, 3]);

    stream.sendAudio(chunk);

    expect(lastInstance().send).toHaveBeenCalledWith(chunk);
  });

  it("drops audio frames once the socket is no longer OPEN", () => {
    const stream = startStream();
    lastInstance().readyState = FakeWebSocket.CLOSED;

    stream.sendAudio(Buffer.from([1]));

    expect(lastInstance().send).not.toHaveBeenCalled();
  });

  it("wraps a WS error event in STTConnectionError and notifies error listeners", () => {
    const stream = startStream();
    const onError = jest.fn();
    stream.onError(onError);

    lastInstance().emit("error", new Error("boom"));

    expect(onError).toHaveBeenCalledWith(expect.any(STTConnectionError));
  });

  it("notifies close listeners when the WS connection closes", () => {
    const stream = startStream();
    const onClose = jest.fn();
    stream.onClose(onClose);

    lastInstance().emit("close");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("close() closes an OPEN socket", () => {
    const stream = startStream();

    stream.close();

    expect(lastInstance().close).toHaveBeenCalledTimes(1);
  });

  it("close() is a no-op once the socket is already CLOSED", () => {
    const stream = startStream();
    lastInstance().readyState = FakeWebSocket.CLOSED;

    stream.close();

    expect(lastInstance().close).not.toHaveBeenCalled();
  });
});
