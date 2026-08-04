import {
  TelephonyInvalidCredentialsError,
  TelephonyProviderApiError,
  TelephonyRateLimitError,
  TelephonyWebhookSignatureError,
} from "../../errors/telephony.errors";
import type { TelephonyCredentials } from "../../interfaces/telephony-credentials.interface";

const mockCallsCreate = jest.fn();
const mockCallsHangup = jest.fn();
const mockCallsGet = jest.fn();
const mockValidateSignature = jest.fn();

jest.mock("plivo", () => ({
  Client: jest.fn().mockImplementation(() => ({
    calls: {
      create: mockCallsCreate,
      hangup: mockCallsHangup,
      get: mockCallsGet,
    },
  })),
  validateSignature: (...args: unknown[]) => mockValidateSignature(...args),
  Response: jest.fn().mockImplementation(() => {
    const elements: string[] = [];
    return {
      addSpeak: (body: string) => elements.push(`<Speak>${body}</Speak>`),
      addRecord: () => elements.push("<Record/>"),
      addStream: (body: string) => elements.push(`<Stream>${body}</Stream>`),
      toXML: () => `<Response>${elements.join("")}</Response>`,
    };
  }),
}));

// eslint-disable-next-line import/first
import { PlivoProvider } from "./plivo.provider";

const CREDENTIALS: TelephonyCredentials = {
  provider: "PLIVO",
  authId: "AC_test",
  authToken: "plain-token",
  phoneNumber: "+14155550000",
};

describe("PlivoProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("makeCall", () => {
    it("creates a call and returns the requestUuid as providerCallId", async () => {
      mockCallsCreate.mockResolvedValue({
        apiId: "api-1",
        message: "call fired",
        requestUuid: "req-uuid-1",
      });

      const provider = new PlivoProvider(CREDENTIALS);
      const result = await provider.makeCall({
        to: "+14155551234",
        answerUrl: "https://example.com/webhook?callId=1&type=answer",
        hangupUrl: "https://example.com/webhook?callId=1&type=hangup",
      });

      expect(result.providerCallId).toBe("req-uuid-1");
      expect(mockCallsCreate).toHaveBeenCalledWith(
        "14155550000",
        "14155551234",
        "https://example.com/webhook?callId=1&type=answer",
        expect.objectContaining({
          hangupUrl: "https://example.com/webhook?callId=1&type=hangup",
        }),
      );
    });

    it("handles Plivo returning requestUuid as an array (bulk-call response shape)", async () => {
      mockCallsCreate.mockResolvedValue({
        apiId: "api-1",
        message: "call fired",
        requestUuid: ["req-uuid-array-1"],
      });

      const provider = new PlivoProvider(CREDENTIALS);
      const result = await provider.makeCall({
        to: "+14155551234",
        answerUrl: "https://example.com/webhook",
        hangupUrl: "https://example.com/webhook",
      });

      expect(result.providerCallId).toBe("req-uuid-array-1");
    });

    it("maps a 401 response to TelephonyInvalidCredentialsError", async () => {
      mockCallsCreate.mockRejectedValue({ status: 401, message: "bad auth" });

      const provider = new PlivoProvider(CREDENTIALS);

      await expect(
        provider.makeCall({
          to: "+14155551234",
          answerUrl: "https://example.com/webhook",
          hangupUrl: "https://example.com/webhook",
        }),
      ).rejects.toThrow(TelephonyInvalidCredentialsError);
    });

    it("maps a 429 response to TelephonyRateLimitError", async () => {
      mockCallsCreate.mockRejectedValue({ status: 429 });

      const provider = new PlivoProvider(CREDENTIALS);

      await expect(
        provider.makeCall({
          to: "+14155551234",
          answerUrl: "https://example.com/webhook",
          hangupUrl: "https://example.com/webhook",
        }),
      ).rejects.toThrow(TelephonyRateLimitError);
    });

    it("maps other failures to TelephonyProviderApiError", async () => {
      mockCallsCreate.mockRejectedValue({ status: 500 });

      const provider = new PlivoProvider(CREDENTIALS);

      await expect(
        provider.makeCall({
          to: "+14155551234",
          answerUrl: "https://example.com/webhook",
          hangupUrl: "https://example.com/webhook",
        }),
      ).rejects.toThrow(TelephonyProviderApiError);
    });
  });

  describe("hangup", () => {
    it("hangs up a call by providerCallId", async () => {
      mockCallsHangup.mockResolvedValue({ apiId: "api-2" });

      const provider = new PlivoProvider(CREDENTIALS);
      const result = await provider.hangup("call-uuid-1");

      expect(result.success).toBe(true);
      expect(mockCallsHangup).toHaveBeenCalledWith("call-uuid-1");
    });
  });

  describe("getCall", () => {
    it("normalizes a Plivo RetrieveCallResponse", async () => {
      mockCallsGet.mockResolvedValue({
        callUuid: "call-uuid-1",
        callState: "COMPLETED",
        callDirection: "outbound",
        callDuration: "42",
        answerTime: "2026-01-01 00:00:00+00:00",
        endTime: "2026-01-01 00:00:42+00:00",
        hangupCauseName: "NORMAL_CLEARING",
      });

      const provider = new PlivoProvider(CREDENTIALS);
      const result = await provider.getCall("call-uuid-1");

      expect(result.status).toBe("COMPLETED");
      expect(result.direction).toBe("OUTBOUND");
      expect(result.durationSeconds).toBe(42);
      expect(result.hangupReason).toBe("NORMAL_CLEARING");
      expect(result.answeredAt).toBeInstanceOf(Date);
      expect(result.endedAt).toBeInstanceOf(Date);
    });
  });

  describe("validateWebhook", () => {
    it("passes when the V2 signature is valid", () => {
      mockValidateSignature.mockReturnValue(true);

      const provider = new PlivoProvider(CREDENTIALS);

      expect(() =>
        provider.validateWebhook({
          url: "https://example.com/webhook?callId=1",
          headers: {
            "X-Plivo-Signature-V2": "sig",
            "X-Plivo-Signature-V2-Nonce": "nonce",
          },
          body: {},
        }),
      ).not.toThrow();

      expect(mockValidateSignature).toHaveBeenCalledWith(
        "https://example.com/webhook?callId=1",
        "nonce",
        "sig",
        "plain-token",
      );
    });

    it("is case-insensitive when reading signature headers", () => {
      mockValidateSignature.mockReturnValue(true);

      const provider = new PlivoProvider(CREDENTIALS);

      expect(() =>
        provider.validateWebhook({
          url: "https://example.com/webhook",
          headers: {
            "x-plivo-signature-v2": "sig",
            "x-plivo-signature-v2-nonce": "nonce",
          },
          body: {},
        }),
      ).not.toThrow();
    });

    it("throws TelephonyWebhookSignatureError when headers are missing", () => {
      const provider = new PlivoProvider(CREDENTIALS);

      expect(() =>
        provider.validateWebhook({
          url: "https://example.com/webhook",
          headers: {},
          body: {},
        }),
      ).toThrow(TelephonyWebhookSignatureError);

      expect(mockValidateSignature).not.toHaveBeenCalled();
    });

    it("throws TelephonyWebhookSignatureError when the signature is invalid", () => {
      mockValidateSignature.mockReturnValue(false);

      const provider = new PlivoProvider(CREDENTIALS);

      expect(() =>
        provider.validateWebhook({
          url: "https://example.com/webhook",
          headers: {
            "X-Plivo-Signature-V2": "bad-sig",
            "X-Plivo-Signature-V2-Nonce": "nonce",
          },
          body: {},
        }),
      ).toThrow(TelephonyWebhookSignatureError);
    });
  });

  describe("normalizeWebhookEvent", () => {
    it("normalizes a Plivo hangup callback payload", () => {
      const provider = new PlivoProvider(CREDENTIALS);

      const event = provider.normalizeWebhookEvent({
        CallUUID: "call-uuid-1",
        RequestUUID: "req-uuid-1",
        CallStatus: "completed",
        Duration: "42",
        HangupCause: "NORMAL_CLEARING",
        RecordingUrl: "https://plivo.example/recording.mp3",
      });

      expect(event).toMatchObject({
        providerCallId: "call-uuid-1",
        providerRequestId: "req-uuid-1",
        status: "COMPLETED",
        eventKey: "call-uuid-1:completed",
        recordingUrl: "https://plivo.example/recording.mp3",
        durationSeconds: 42,
        hangupReason: "NORMAL_CLEARING",
      });
      expect(event.occurredAt).toBeInstanceOf(Date);
    });

    it("produces distinct eventKeys for distinct status transitions of the same call (idempotency support)", () => {
      const provider = new PlivoProvider(CREDENTIALS);

      const ringing = provider.normalizeWebhookEvent({
        CallUUID: "call-uuid-1",
        CallStatus: "ringing",
      });
      const completed = provider.normalizeWebhookEvent({
        CallUUID: "call-uuid-1",
        CallStatus: "completed",
      });

      expect(ringing.eventKey).not.toBe(completed.eventKey);
    });
  });

  describe("buildAnswerResponse", () => {
    it("returns the static placeholder XML when no streamUrl is given", () => {
      const provider = new PlivoProvider(CREDENTIALS);

      const response = provider.buildAnswerResponse();

      expect(response.contentType).toBe("text/xml");
      expect(response.body).toContain("<Response>");
      expect(response.body).toContain("<Speak");
      expect(response.body).toContain("<Record");
      expect(response.body).not.toContain("<Stream");
    });

    it("returns a bidirectional <Stream> element when a streamUrl is given", () => {
      const provider = new PlivoProvider(CREDENTIALS);

      const response = provider.buildAnswerResponse({
        streamUrl: "wss://example.com/telephony/media-stream?callId=call-1",
      });

      expect(response.contentType).toBe("text/xml");
      expect(response.body).toContain("<Stream");
      expect(response.body).toContain(
        "wss://example.com/telephony/media-stream?callId=call-1",
      );
      expect(response.body).not.toContain("<Speak");
      expect(response.body).not.toContain("<Record");
    });
  });
});
