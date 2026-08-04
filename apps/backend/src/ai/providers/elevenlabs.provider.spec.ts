import { TTSSynthesisError } from "../errors/ai.errors";
import type { ITTSStream } from "../interfaces/tts-provider.interface";
import { ElevenLabsProvider } from "./elevenlabs.provider";

function fakeResponse(
  overrides: Partial<{ ok: boolean; status: number; chunks: Uint8Array[] }> = {},
) {
  const chunks = overrides.chunks ?? [];
  return {
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    body: (async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    })(),
  };
}

function credentials(voice: string | null = null) {
  return { provider: "ELEVENLABS" as never, apiKey: "el-key", voice };
}

function waitForEnd(stream: ITTSStream): Promise<void> {
  return new Promise((resolve) => stream.onEnd(resolve));
}

function waitForError(stream: ITTSStream): Promise<Error> {
  return new Promise((resolve) => stream.onError(resolve));
}

describe("ElevenLabsProvider", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  });

  it("POSTs to the ElevenLabs stream endpoint for the requested voice", async () => {
    fetchMock.mockResolvedValue(fakeResponse());
    const provider = new ElevenLabsProvider(credentials());
    const stream = provider.synthesizeStream("hello", { voice: "voice-a" });

    await waitForEnd(stream);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/text-to-speech/voice-a/stream",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "xi-api-key": "el-key" }),
      }),
    );
  });

  it("falls back to the workspace's configured voice when the call doesn't specify one", async () => {
    fetchMock.mockResolvedValue(fakeResponse());
    const provider = new ElevenLabsProvider(credentials("workspace-voice"));
    const stream = provider.synthesizeStream("hello");

    await waitForEnd(stream);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/text-to-speech/workspace-voice/stream"),
      expect.anything(),
    );
  });

  it("falls back to the default voice when neither the call nor the workspace specifies one", async () => {
    fetchMock.mockResolvedValue(fakeResponse());
    const provider = new ElevenLabsProvider(credentials(null));
    const stream = provider.synthesizeStream("hello");

    await waitForEnd(stream);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream"),
      expect.anything(),
    );
  });

  describe("persona knobs (Sprint 18)", () => {
    it("sends no voice_settings block when no persona knobs are given -- body stays byte-identical to before", async () => {
      fetchMock.mockResolvedValue(fakeResponse());
      const provider = new ElevenLabsProvider(credentials());
      const stream = provider.synthesizeStream("hello", { voice: "voice-a" });

      await waitForEnd(stream);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({ text: "hello", model_id: "eleven_turbo_v2" });
    });

    it("maps speakingRate and warmth into ElevenLabs' voice_settings.speed/style", async () => {
      fetchMock.mockResolvedValue(fakeResponse());
      const provider = new ElevenLabsProvider(credentials());
      const stream = provider.synthesizeStream("hello", {
        voice: "voice-a",
        speakingRate: 1.2,
        warmth: 0.8,
      });

      await waitForEnd(stream);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.voice_settings).toEqual({ speed: 1.2, style: 0.8 });
    });

    it("does not map pitch -- accepted but no ElevenLabs equivalent today", async () => {
      fetchMock.mockResolvedValue(fakeResponse());
      const provider = new ElevenLabsProvider(credentials());
      const stream = provider.synthesizeStream("hello", { voice: "voice-a", pitch: 0.5 });

      await waitForEnd(stream);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.voice_settings).toBeUndefined();
    });
  });

  it("emits each audio chunk in order, then onEnd", async () => {
    const chunkA = new Uint8Array([1, 2, 3]);
    const chunkB = new Uint8Array([4, 5]);
    fetchMock.mockResolvedValue(fakeResponse({ chunks: [chunkA, chunkB] }));
    const provider = new ElevenLabsProvider(credentials());
    const stream = provider.synthesizeStream("hello");

    const received: Buffer[] = [];
    stream.onAudioChunk((chunk) => received.push(chunk));
    await waitForEnd(stream);

    expect(received).toEqual([Buffer.from(chunkA), Buffer.from(chunkB)]);
  });

  it("wraps a non-OK response in TTSSynthesisError", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: false, status: 500 }));
    const provider = new ElevenLabsProvider(credentials());
    const stream = provider.synthesizeStream("hello");

    const error = await waitForError(stream);

    expect(error).toBeInstanceOf(TTSSynthesisError);
  });

  it("wraps an unexpected fetch rejection in TTSSynthesisError", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const provider = new ElevenLabsProvider(credentials());
    const stream = provider.synthesizeStream("hello");

    const error = await waitForError(stream);

    expect(error).toBeInstanceOf(TTSSynthesisError);
  });

  it("cancel() aborts the in-flight fetch and never emits onEnd or onError", async () => {
    let capturedSignal: AbortSignal | undefined;
    fetchMock.mockImplementation(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          capturedSignal = options.signal;
          options.signal.addEventListener("abort", () => {
            const abortError = new Error("aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        }),
    );
    const provider = new ElevenLabsProvider(credentials());
    const stream = provider.synthesizeStream("hello");
    const onEnd = jest.fn();
    const onError = jest.fn();
    stream.onEnd(onEnd);
    stream.onError(onError);

    stream.cancel();
    await new Promise((resolve) => setImmediate(resolve));

    expect(capturedSignal?.aborted).toBe(true);
    expect(onEnd).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("cancel() stops emitting further chunks mid-stream", async () => {
    const provider = new ElevenLabsProvider(credentials());
    let yieldedFirst: () => void = () => {};
    const firstYielded = new Promise<void>((resolve) => {
      yieldedFirst = resolve;
    });

    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        body: (async function* () {
          yield new Uint8Array([1]);
          yieldedFirst();
          // Yield control so the test can call cancel() before the next chunk.
          await new Promise((resolve) => setImmediate(resolve));
          yield new Uint8Array([2]);
        })(),
      }),
    );

    const stream = provider.synthesizeStream("hello");
    const received: Buffer[] = [];
    stream.onAudioChunk((chunk) => received.push(chunk));

    await firstYielded;
    stream.cancel();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(received).toEqual([Buffer.from([1])]);
  });
});
