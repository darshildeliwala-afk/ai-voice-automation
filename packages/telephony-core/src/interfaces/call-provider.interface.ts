import type {
  NormalizedCallDirection,
  NormalizedCallStatus,
} from "./call-status.types";

export interface MakeCallInput {
  /** E.164 destination number, e.g. "+14155552671". */
  to: string;
  /** Public HTTPS URL the provider invokes when the call is answered. */
  answerUrl: string;
  /** Public HTTPS URL the provider invokes when the call ends. */
  hangupUrl: string;
  /** Enable call recording, if the provider supports it. */
  record?: boolean;
  /** Maximum ring time in seconds before the call is cancelled. */
  ringTimeoutSeconds?: number;
}

export interface MakeCallResult {
  /**
   * Best-known unique identifier for this call at creation time. Most
   * providers (Plivo included) only hand back a request-scoped id
   * synchronously -- the durable call id typically arrives on the first
   * webhook and should replace this value once known.
   */
  providerCallId: string;
  /** Raw, provider-specific response payload -- persist as-is for audit/debug. */
  rawResponse: Record<string, unknown>;
}

export interface GetCallResult {
  providerCallId: string;
  status: NormalizedCallStatus;
  direction: NormalizedCallDirection;
  durationSeconds: number | null;
  answeredAt: Date | null;
  endedAt: Date | null;
  hangupReason: string | null;
  rawResponse: Record<string, unknown>;
}

export interface HangupResult {
  success: boolean;
  rawResponse: Record<string, unknown>;
}

/** The response a provider expects back from its own "answer" webhook. */
export interface AnswerResponse {
  contentType: string;
  body: string;
}

export interface WebhookValidationInput {
  /** The exact public URL the provider was configured to call back to. */
  url: string;
  /** HTTP headers from the inbound webhook request (case-insensitive lookups expected). */
  headers: Record<string, string | string[] | undefined>;
  /** Parsed POST body (form-encoded or JSON, already decoded by the framework). */
  body: Record<string, unknown>;
}

/** A provider webhook event, normalized to our own vocabulary. */
export interface NormalizedCallEvent {
  providerCallId: string;
  /** Secondary correlation id some providers hand out at creation time (e.g. Plivo's requestUuid). */
  providerRequestId: string | null;
  status: NormalizedCallStatus;
  /** A dedup key unique per (call, lifecycle transition) -- used for idempotent processing. */
  eventKey: string;
  recordingUrl: string | null;
  durationSeconds: number | null;
  hangupReason: string | null;
  occurredAt: Date;
  rawPayload: Record<string, unknown>;
}

/**
 * Abstraction over a single outbound-telephony provider. Exactly one
 * concrete implementation exists today (PlivoProvider) -- adding Twilio,
 * Exotel, Retell, Vapi, etc. later means adding a new class here plus a
 * case in providers/provider.factory.ts, with zero changes to any caller.
 */
export interface ICallProvider {
  makeCall(input: MakeCallInput): Promise<MakeCallResult>;
  hangup(providerCallId: string): Promise<HangupResult>;
  getCall(providerCallId: string): Promise<GetCallResult>;
  /** Validates the webhook's authenticity; throws TelephonyWebhookSignatureError if invalid. */
  validateWebhook(input: WebhookValidationInput): void;
  /** Normalizes a raw, already-signature-validated webhook body into our vocabulary. */
  normalizeWebhookEvent(
    body: Record<string, unknown>,
  ): NormalizedCallEvent;
  /**
   * Builds the response the provider expects when it hits our "answer"
   * callback for a live call. No AI conversation engine exists yet (out of
   * scope for this sprint) -- this returns a minimal, static placeholder so
   * the call can be observed end-to-end (answered, optionally recorded,
   * hung up) rather than dropped immediately for lack of a valid response.
   */
  buildAnswerResponse(): AnswerResponse;
}
