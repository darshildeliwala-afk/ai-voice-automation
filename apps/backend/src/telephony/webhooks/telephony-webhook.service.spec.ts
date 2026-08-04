import { BadRequestException, NotFoundException } from "@nestjs/common";

import { CallStatus, Prisma } from "../../generated/prisma/client";
import { TelephonyWebhookService } from "./telephony-webhook.service";

const WORKSPACE_ID = "workspace-1";
const CALL_ID = "call-1";

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed on the fields: (`provider`,`providerCallId`,`eventType`)",
    { code: "P2002", clientVersion: "7.9.1" },
  );
}

function setup() {
  const call = { findFirst: jest.fn(), update: jest.fn() };
  const telephonyWebhookEvent = { create: jest.fn().mockResolvedValue({}) };
  const prisma = { call, telephonyWebhookEvent };

  const validateWebhook = jest.fn();
  const normalizeWebhookEvent = jest.fn();
  const buildAnswerResponse = jest
    .fn()
    .mockReturnValue({ contentType: "text/xml", body: "<Response/>" });

  const fakeProvider = {
    validateWebhook,
    normalizeWebhookEvent,
    buildAnswerResponse,
  };

  const providerFactory = {
    createForWorkspace: jest.fn().mockResolvedValue(fakeProvider),
  };
  const callQueueService = {
    complete: jest.fn(),
    findById: jest.fn().mockResolvedValue({ id: "queue-1", aiAgentId: null }),
  };
  const conversationEngine = {
    processMessage: jest.fn().mockResolvedValue({ conversationId: "conv-1" }),
  };

  const service = new TelephonyWebhookService(
    prisma as never,
    providerFactory as never,
    callQueueService as never,
    conversationEngine as never,
  );

  return {
    service,
    prisma,
    call,
    telephonyWebhookEvent,
    fakeProvider,
    providerFactory,
    callQueueService,
    conversationEngine,
  };
}

function baseCallRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CALL_ID,
    workspaceId: WORKSPACE_ID,
    callQueueId: "queue-1",
    provider: "PLIVO",
    providerCallId: "req-uuid-1",
    status: CallStatus.INITIATED,
    answeredAt: null,
    durationSeconds: null,
    recordingUrl: null,
    hangupReason: null,
    ...overrides,
  };
}

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    providerCallId: "call-uuid-1",
    providerRequestId: "req-uuid-1",
    status: CallStatus.RINGING,
    eventKey: "call-uuid-1:ringing",
    recordingUrl: null,
    durationSeconds: null,
    hangupReason: null,
    occurredAt: new Date(),
    rawPayload: {},
    ...overrides,
  };
}

describe("TelephonyWebhookService", () => {
  it("throws NotFoundException when the call does not exist", async () => {
    const { service, call } = setup();
    call.findFirst.mockResolvedValue(null);

    await expect(
      service.processWebhook({
        callId: "missing",
        type: "answer",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("validates the webhook signature via the resolved provider", async () => {
    const { service, call, fakeProvider } = setup();
    call.findFirst.mockResolvedValue(baseCallRow());
    fakeProvider.normalizeWebhookEvent.mockReturnValue(baseEvent());

    await service.processWebhook({
      callId: CALL_ID,
      type: "answer",
      url: "https://example.com/telephony/webhook?callId=call-1&type=answer",
      headers: { "x-plivo-signature-v2": "sig" },
      body: { CallUUID: "call-uuid-1" },
    });

    expect(fakeProvider.validateWebhook).toHaveBeenCalledWith({
      url: "https://example.com/telephony/webhook?callId=call-1&type=answer",
      headers: { "x-plivo-signature-v2": "sig" },
      body: { CallUUID: "call-uuid-1" },
    });
  });

  describe("event correlation", () => {
    it("allows the first webhook when it matches the stored requestUuid", async () => {
      const { service, call, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(
        baseCallRow({ providerCallId: "req-uuid-1" }),
      );
      fakeProvider.normalizeWebhookEvent.mockReturnValue(
        baseEvent({
          providerCallId: "call-uuid-1",
          providerRequestId: "req-uuid-1",
        }),
      );

      await expect(
        service.processWebhook({
          callId: CALL_ID,
          type: "answer",
          url: "https://example.com/telephony/webhook",
          headers: {},
          body: {},
        }),
      ).resolves.not.toThrow();
    });

    it("rejects when neither providerCallId nor providerRequestId match the stored value", async () => {
      const { service, call, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(
        baseCallRow({ providerCallId: "req-uuid-1" }),
      );
      fakeProvider.normalizeWebhookEvent.mockReturnValue(
        baseEvent({
          providerCallId: "unrelated-call-uuid",
          providerRequestId: "unrelated-request-uuid",
        }),
      );

      await expect(
        service.processWebhook({
          callId: CALL_ID,
          type: "hangup",
          url: "https://example.com/telephony/webhook",
          headers: {},
          body: {},
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("allows correlation via the real CallUUID once it has replaced the requestUuid", async () => {
      const { service, call, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(
        baseCallRow({ providerCallId: "call-uuid-1" }),
      );
      fakeProvider.normalizeWebhookEvent.mockReturnValue(
        baseEvent({ providerCallId: "call-uuid-1", providerRequestId: null }),
      );

      await expect(
        service.processWebhook({
          callId: CALL_ID,
          type: "hangup",
          url: "https://example.com/telephony/webhook",
          headers: {},
          body: {},
        }),
      ).resolves.not.toThrow();
    });

    it("allows any correlation when the call has no providerCallId stored yet", async () => {
      const { service, call, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(baseCallRow({ providerCallId: null }));
      fakeProvider.normalizeWebhookEvent.mockReturnValue(
        baseEvent({ providerCallId: "brand-new-call-uuid" }),
      );

      await expect(
        service.processWebhook({
          callId: CALL_ID,
          type: "answer",
          url: "https://example.com/telephony/webhook",
          headers: {},
          body: {},
        }),
      ).resolves.not.toThrow();
    });
  });

  describe("idempotency", () => {
    it("applies the event and updates the Call row on first delivery", async () => {
      const { service, call, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(baseCallRow());
      fakeProvider.normalizeWebhookEvent.mockReturnValue(
        baseEvent({ status: CallStatus.CONNECTED }),
      );

      await service.processWebhook({
        callId: CALL_ID,
        type: "answer",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      });

      expect(call.update).toHaveBeenCalledTimes(1);
      expect(call.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CALL_ID },
          data: expect.objectContaining({ status: CallStatus.CONNECTED }),
        }),
      );
    });

    it("skips applying the event again on a duplicate delivery (unique constraint hit)", async () => {
      const { service, call, telephonyWebhookEvent, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(baseCallRow());
      fakeProvider.normalizeWebhookEvent.mockReturnValue(baseEvent());
      telephonyWebhookEvent.create.mockRejectedValue(
        uniqueConstraintError(),
      );

      await service.processWebhook({
        callId: CALL_ID,
        type: "hangup",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      });

      expect(call.update).not.toHaveBeenCalled();
    });

    it("still returns the answer XML on a duplicate delivery of the answer callback", async () => {
      const { service, call, telephonyWebhookEvent, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(baseCallRow());
      fakeProvider.normalizeWebhookEvent.mockReturnValue(baseEvent());
      telephonyWebhookEvent.create.mockRejectedValue(
        uniqueConstraintError(),
      );

      const result = await service.processWebhook({
        callId: CALL_ID,
        type: "answer",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      });

      expect(result).toEqual({ contentType: "text/xml", body: "<Response/>" });
    });
  });

  describe("lifecycle effects", () => {
    it("sets answeredAt on the first CONNECTED event only", async () => {
      const { service, call, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(baseCallRow({ answeredAt: null }));
      fakeProvider.normalizeWebhookEvent.mockReturnValue(
        baseEvent({ status: CallStatus.CONNECTED }),
      );

      await service.processWebhook({
        callId: CALL_ID,
        type: "answer",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      });

      expect(call.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ answeredAt: expect.any(Date) }),
        }),
      );
    });

    it("marks the CallQueue row complete on a terminal status", async () => {
      const { service, call, callQueueService, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(baseCallRow());
      fakeProvider.normalizeWebhookEvent.mockReturnValue(
        baseEvent({ status: CallStatus.COMPLETED, durationSeconds: 30 }),
      );

      await service.processWebhook({
        callId: CALL_ID,
        type: "hangup",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      });

      expect(callQueueService.complete).toHaveBeenCalledWith("queue-1");
      expect(call.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            endedAt: expect.any(Date),
            durationSeconds: 30,
          }),
        }),
      );
    });

    it("does not mark the CallQueue row complete on a non-terminal status", async () => {
      const { service, call, callQueueService, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(baseCallRow());
      fakeProvider.normalizeWebhookEvent.mockReturnValue(
        baseEvent({ status: CallStatus.RINGING }),
      );

      await service.processWebhook({
        callId: CALL_ID,
        type: "answer",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      });

      expect(callQueueService.complete).not.toHaveBeenCalled();
    });

    it("captures the recordingUrl when present on the event", async () => {
      const { service, call, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(baseCallRow());
      fakeProvider.normalizeWebhookEvent.mockReturnValue(
        baseEvent({
          status: CallStatus.COMPLETED,
          recordingUrl: "https://plivo.example/recording.mp3",
        }),
      );

      await service.processWebhook({
        callId: CALL_ID,
        type: "hangup",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      });

      expect(call.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recordingUrl: "https://plivo.example/recording.mp3",
          }),
        }),
      );
    });
  });

  describe("conversation engine trigger (Sprint 15 worker integration)", () => {
    it("triggers the conversation engine on the first CONNECTED event", async () => {
      const { service, call, callQueueService, conversationEngine, fakeProvider } =
        setup();
      call.findFirst.mockResolvedValue(
        baseCallRow({
          workspaceId: WORKSPACE_ID,
          customerId: "customer-1",
          orderId: "order-1",
          answeredAt: null,
        }),
      );
      callQueueService.findById.mockResolvedValue({
        id: "queue-1",
        aiAgentId: "agent-1",
      });
      fakeProvider.normalizeWebhookEvent.mockReturnValue(
        baseEvent({ status: CallStatus.CONNECTED }),
      );

      await service.processWebhook({
        callId: CALL_ID,
        type: "answer",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      });

      expect(callQueueService.findById).toHaveBeenCalledWith("queue-1");
      expect(conversationEngine.processMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          customerId: "customer-1",
          orderId: "order-1",
          aiAgentId: "agent-1",
          callId: CALL_ID,
        }),
      );
    });

    it("does not trigger the conversation engine on a non-first-connect event (e.g. RINGING)", async () => {
      const { service, call, conversationEngine, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(baseCallRow({ answeredAt: null }));
      fakeProvider.normalizeWebhookEvent.mockReturnValue(
        baseEvent({ status: CallStatus.RINGING }),
      );

      await service.processWebhook({
        callId: CALL_ID,
        type: "answer",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      });

      expect(conversationEngine.processMessage).not.toHaveBeenCalled();
    });

    it("does not re-trigger on a second CONNECTED event for the same call", async () => {
      const { service, call, conversationEngine, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(
        baseCallRow({ answeredAt: new Date() }),
      );
      fakeProvider.normalizeWebhookEvent.mockReturnValue(
        baseEvent({ status: CallStatus.CONNECTED }),
      );

      await service.processWebhook({
        callId: CALL_ID,
        type: "answer",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      });

      expect(conversationEngine.processMessage).not.toHaveBeenCalled();
    });

    it("does not let a conversation-engine failure break webhook processing", async () => {
      const { service, call, conversationEngine, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(baseCallRow({ answeredAt: null }));
      fakeProvider.normalizeWebhookEvent.mockReturnValue(
        baseEvent({ status: CallStatus.CONNECTED }),
      );
      conversationEngine.processMessage.mockRejectedValue(
        new Error("AI provider exploded"),
      );

      const result = await service.processWebhook({
        callId: CALL_ID,
        type: "answer",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      });

      expect(result).toEqual({ contentType: "text/xml", body: "<Response/>" });
      expect(call.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: CallStatus.CONNECTED }),
        }),
      );
    });
  });

  describe("response shape", () => {
    it("returns XML for an answer-type webhook", async () => {
      const { service, call, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(baseCallRow());
      fakeProvider.normalizeWebhookEvent.mockReturnValue(baseEvent());

      const result = await service.processWebhook({
        callId: CALL_ID,
        type: "answer",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      });

      expect(result).toEqual({ contentType: "text/xml", body: "<Response/>" });
    });

    it("returns null for a hangup-type webhook", async () => {
      const { service, call, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(baseCallRow());
      fakeProvider.normalizeWebhookEvent.mockReturnValue(baseEvent());

      const result = await service.processWebhook({
        callId: CALL_ID,
        type: "hangup",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      });

      expect(result).toBeNull();
    });
  });

  describe("media stream (Sprint 17)", () => {
    const ORIGINAL_BASE_URL = process.env.TELEPHONY_WEBHOOK_BASE_URL;

    afterEach(() => {
      if (ORIGINAL_BASE_URL === undefined) {
        delete process.env.TELEPHONY_WEBHOOK_BASE_URL;
      } else {
        process.env.TELEPHONY_WEBHOOK_BASE_URL = ORIGINAL_BASE_URL;
      }
    });

    it("passes a wss:// media-stream URL to buildAnswerResponse when TELEPHONY_WEBHOOK_BASE_URL is configured", async () => {
      process.env.TELEPHONY_WEBHOOK_BASE_URL = "https://example.com/";
      const { service, call, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(baseCallRow());
      fakeProvider.normalizeWebhookEvent.mockReturnValue(baseEvent());

      await service.processWebhook({
        callId: CALL_ID,
        type: "answer",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      });

      expect(fakeProvider.buildAnswerResponse).toHaveBeenCalledWith({
        streamUrl: `wss://example.com/telephony/media-stream?callId=${CALL_ID}`,
      });
    });

    it("passes an undefined streamUrl when TELEPHONY_WEBHOOK_BASE_URL is not configured", async () => {
      delete process.env.TELEPHONY_WEBHOOK_BASE_URL;
      const { service, call, fakeProvider } = setup();
      call.findFirst.mockResolvedValue(baseCallRow());
      fakeProvider.normalizeWebhookEvent.mockReturnValue(baseEvent());

      await service.processWebhook({
        callId: CALL_ID,
        type: "answer",
        url: "https://example.com/telephony/webhook",
        headers: {},
        body: {},
      });

      expect(fakeProvider.buildAnswerResponse).toHaveBeenCalledWith({
        streamUrl: undefined,
      });
    });
  });
});
