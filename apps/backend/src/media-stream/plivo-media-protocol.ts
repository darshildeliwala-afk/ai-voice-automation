/**
 * Parsing/serialization for Plivo's Media Streams WS wire protocol. Kept
 * isolated from MediaSessionService's orchestration logic so the protocol
 * shape can be verified in isolation and adjusted without touching
 * business logic.
 */

export interface PlivoStartEvent {
  event: "start";
  start?: {
    streamId?: string;
    callId?: string;
    mediaFormat?: {
      encoding?: string;
      sampleRate?: number;
      channels?: number;
    };
  };
}

export interface PlivoMediaEvent {
  event: "media";
  media?: {
    track?: string;
    payload?: string;
  };
}

export interface PlivoStopEvent {
  event: "stop";
}

export interface PlivoDtmfEvent {
  event: "dtmf";
  dtmf?: { digit?: string };
}

export type PlivoInboundEvent =
  | PlivoStartEvent
  | PlivoMediaEvent
  | PlivoStopEvent
  | PlivoDtmfEvent
  | { event: string };

/** Returns null for malformed/non-JSON frames rather than throwing. */
export function parseInboundMessage(raw: string | Buffer): PlivoInboundEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw.toString());
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { event?: unknown }).event === "string"
    ) {
      return parsed as PlivoInboundEvent;
    }
    return null;
  } catch {
    return null;
  }
}

/** Returns an empty buffer if the event carries no payload rather than throwing. */
export function decodeMediaPayload(event: PlivoMediaEvent): Buffer {
  const payload = event.media?.payload;
  return payload ? Buffer.from(payload, "base64") : Buffer.alloc(0);
}

export function buildPlayAudioMessage(
  chunk: Buffer,
  options: { contentType: string; sampleRate: number },
): string {
  return JSON.stringify({
    event: "playAudio",
    media: {
      contentType: options.contentType,
      sampleRate: options.sampleRate,
      payload: chunk.toString("base64"),
    },
  });
}

export function buildClearAudioMessage(): string {
  return JSON.stringify({ event: "clearAudio" });
}
