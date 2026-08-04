import {
  buildClearAudioMessage,
  buildPlayAudioMessage,
  decodeMediaPayload,
  parseInboundMessage,
} from "./plivo-media-protocol";

describe("parseInboundMessage", () => {
  it("parses a well-formed start event", () => {
    const raw = JSON.stringify({
      event: "start",
      start: { streamId: "s1", callId: "c1", mediaFormat: { encoding: "mulaw", sampleRate: 8000 } },
    });

    const parsed = parseInboundMessage(raw);

    expect(parsed).toEqual({
      event: "start",
      start: { streamId: "s1", callId: "c1", mediaFormat: { encoding: "mulaw", sampleRate: 8000 } },
    });
  });

  it("parses a Buffer the same as a string", () => {
    const raw = Buffer.from(JSON.stringify({ event: "stop" }));

    expect(parseInboundMessage(raw)).toEqual({ event: "stop" });
  });

  it("returns null for non-JSON input", () => {
    expect(parseInboundMessage("not json")).toBeNull();
  });

  it("returns null for JSON with no event field", () => {
    expect(parseInboundMessage(JSON.stringify({ foo: "bar" }))).toBeNull();
  });

  it("returns null for a JSON array", () => {
    expect(parseInboundMessage(JSON.stringify([1, 2, 3]))).toBeNull();
  });
});

describe("decodeMediaPayload", () => {
  it("base64-decodes the media payload into a Buffer", () => {
    const payload = Buffer.from([1, 2, 3]).toString("base64");
    const event = { event: "media" as const, media: { payload } };

    expect(decodeMediaPayload(event)).toEqual(Buffer.from([1, 2, 3]));
  });

  it("returns an empty buffer when no payload is present", () => {
    expect(decodeMediaPayload({ event: "media" })).toEqual(Buffer.alloc(0));
  });
});

describe("buildPlayAudioMessage", () => {
  it("serializes a base64-encoded playAudio event", () => {
    const chunk = Buffer.from([9, 8, 7]);

    const message = buildPlayAudioMessage(chunk, { contentType: "audio/x-mulaw", sampleRate: 8000 });

    expect(JSON.parse(message)).toEqual({
      event: "playAudio",
      media: {
        contentType: "audio/x-mulaw",
        sampleRate: 8000,
        payload: chunk.toString("base64"),
      },
    });
  });
});

describe("buildClearAudioMessage", () => {
  it("serializes a clearAudio event", () => {
    expect(JSON.parse(buildClearAudioMessage())).toEqual({ event: "clearAudio" });
  });
});
