import * as plivo from "plivo";
// The published .d.ts declares `Response` as a plain function overloaded
// with a class, which `import * as plivo` doesn't merge into a
// constructable type. Re-declare the constructor shape locally rather than
// reaching for `any`.
const PlivoXmlResponse = plivo.Response as unknown as new () => {
  addSpeak(body: string, attributes: Record<string, unknown>): unknown;
  addRecord(attributes: Record<string, unknown>): unknown;
  addStream(body: string, attributes: Record<string, unknown>): unknown;
  toXML(): string;
};

import {
  TelephonyInvalidCredentialsError,
  TelephonyProviderApiError,
  TelephonyProviderTimeoutError,
  TelephonyRateLimitError,
  TelephonyWebhookSignatureError,
} from "../../errors/telephony.errors";
import type {
  AnswerResponse,
  BuildAnswerResponseInput,
  GetCallResult,
  HangupResult,
  ICallProvider,
  MakeCallInput,
  MakeCallResult,
  NormalizedCallEvent,
  WebhookValidationInput,
} from "../../interfaces/call-provider.interface";
import type { TelephonyCredentials } from "../../interfaces/telephony-credentials.interface";
import { mapPlivoStatus } from "./plivo-status.mapper";

const PROVIDER_NAME = "Plivo";

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const lowerName = name.toLowerCase();
  const key = Object.keys(headers).find((k) => k.toLowerCase() === lowerName);
  const value = key ? headers[key] : undefined;
  return Array.isArray(value) ? value[0] : value;
}

function toE164Digits(phoneNumber: string): string {
  // Plivo's `to`/`from` params want digits only (country code, no `+`).
  return phoneNumber.replace(/[^\d]/g, "");
}

/** Re-throws provider-facing errors typed by cause, so callers can branch on them. */
function mapPlivoError(operation: string, error: unknown): never {
  const err = error as {
    status?: number;
    code?: string;
    message?: string;
  } | null;

  if (err?.code === "ECONNABORTED" || err?.code === "ETIMEDOUT") {
    throw new TelephonyProviderTimeoutError(PROVIDER_NAME, operation);
  }

  if (err?.status === 401 || err?.status === 403) {
    throw new TelephonyInvalidCredentialsError(PROVIDER_NAME, error);
  }

  if (err?.status === 429) {
    throw new TelephonyRateLimitError(PROVIDER_NAME);
  }

  throw new TelephonyProviderApiError(
    PROVIDER_NAME,
    operation,
    err?.status,
    error,
  );
}

export class PlivoProvider implements ICallProvider {
  private readonly client: plivo.Client;
  private readonly credentials: TelephonyCredentials;

  constructor(credentials: TelephonyCredentials) {
    this.credentials = credentials;
    this.client = new plivo.Client(credentials.authId, credentials.authToken);
  }

  async makeCall(input: MakeCallInput): Promise<MakeCallResult> {
    try {
      const response = await this.client.calls.create(
        toE164Digits(this.credentials.phoneNumber),
        toE164Digits(input.to),
        input.answerUrl,
        {
          hangupUrl: input.hangupUrl,
          answerMethod: "POST",
          hangupMethod: "POST",
          ringTimeout: input.ringTimeoutSeconds ?? 60,
        },
      );

      const requestUuid = Array.isArray(response.requestUuid)
        ? response.requestUuid[0]
        : response.requestUuid;

      return {
        providerCallId: requestUuid,
        rawResponse: { ...response },
      };
    } catch (error) {
      mapPlivoError("makeCall", error);
    }
  }

  async hangup(providerCallId: string): Promise<HangupResult> {
    try {
      const response = await this.client.calls.hangup(providerCallId);
      return { success: true, rawResponse: { ...response } };
    } catch (error) {
      mapPlivoError("hangup", error);
    }
  }

  async getCall(providerCallId: string): Promise<GetCallResult> {
    try {
      const response = await this.client.calls.get(providerCallId);
      const raw = response as unknown as Record<string, unknown>;

      return {
        providerCallId: (raw.callUuid as string) ?? providerCallId,
        status: mapPlivoStatus((raw.callState as string) ?? "failed"),
        direction:
          (raw.callDirection as string)?.toLowerCase() === "inbound"
            ? "INBOUND"
            : "OUTBOUND",
        durationSeconds: raw.callDuration
          ? Number(raw.callDuration)
          : null,
        answeredAt: raw.answerTime ? new Date(raw.answerTime as string) : null,
        endedAt: raw.endTime ? new Date(raw.endTime as string) : null,
        hangupReason: (raw.hangupCauseName as string) ?? null,
        rawResponse: { ...raw },
      };
    } catch (error) {
      mapPlivoError("getCall", error);
    }
  }

  validateWebhook(input: WebhookValidationInput): void {
    const signature = getHeader(input.headers, "X-Plivo-Signature-V2");
    const nonce = getHeader(input.headers, "X-Plivo-Signature-V2-Nonce");

    if (!signature || !nonce) {
      throw new TelephonyWebhookSignatureError(PROVIDER_NAME);
    }

    const isValid = plivo.validateSignature(
      input.url,
      nonce,
      signature,
      this.credentials.authToken,
    );

    if (!isValid) {
      throw new TelephonyWebhookSignatureError(PROVIDER_NAME);
    }
  }

  normalizeWebhookEvent(body: Record<string, unknown>): NormalizedCallEvent {
    const callUuid = String(body.CallUUID ?? "");
    const requestUuid = body.RequestUUID ? String(body.RequestUUID) : null;
    const rawStatus = String(body.CallStatus ?? "failed");
    const status = mapPlivoStatus(rawStatus);

    return {
      providerCallId: callUuid,
      providerRequestId: requestUuid,
      status,
      eventKey: `${callUuid || requestUuid}:${rawStatus}`,
      recordingUrl: body.RecordingUrl ? String(body.RecordingUrl) : null,
      durationSeconds: body.Duration ? Number(body.Duration) : null,
      hangupReason: body.HangupCause ? String(body.HangupCause) : null,
      occurredAt: new Date(),
      rawPayload: body,
    };
  }

  buildAnswerResponse(input: BuildAnswerResponseInput = {}): AnswerResponse {
    const response = new PlivoXmlResponse();

    if (input.streamUrl) {
      response.addStream(input.streamUrl, {
        bidirectional: true,
        keepCallAlive: true,
        contentType: "audio/x-mulaw;rate=8000",
      });

      return { contentType: "text/xml", body: response.toXML() };
    }

    response.addSpeak(
      "Thank you for confirming. This call is being recorded for quality purposes.",
      { voice: "WOMAN", language: "en-US" },
    );
    response.addRecord({
      maxLength: 30,
      playBeep: true,
      transcriptionType: "none",
    });

    return { contentType: "text/xml", body: response.toXML() };
  }
}
