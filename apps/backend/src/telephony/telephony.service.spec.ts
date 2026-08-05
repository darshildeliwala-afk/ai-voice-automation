import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  TelephonyConfigMissingError,
  TelephonyProviderInactiveError,
} from "@ai-voice-automation/telephony-core";

import { CallDirection, CallStatus } from "../generated/prisma/client";
import { TelephonyService } from "./telephony.service";

const WORKSPACE_ID = "workspace-1";
const QUEUE_ID = "queue-1";
const ORDER_ID = "order-1";
const CUSTOMER_ID = "customer-1";

function setup() {
  const call = {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  };
  const liveCallState = { findMany: jest.fn() };
  const prisma = { call, liveCallState };

  const orderService = {
    getOrderById: jest.fn().mockResolvedValue({
      id: ORDER_ID,
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    }),
  };
  const customerService = {
    getCustomerById: jest.fn().mockResolvedValue({
      id: CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      phone: "+14155551234",
    }),
  };
  const callQueueService = {
    findById: jest.fn().mockResolvedValue({
      id: QUEUE_ID,
      orderId: ORDER_ID,
    }),
    expediteNow: jest.fn().mockResolvedValue({}),
    enqueue: jest.fn().mockResolvedValue({ id: QUEUE_ID, status: "QUEUED" }),
  };
  const telephonyConfigService = {
    getActiveConfig: jest.fn().mockResolvedValue({
      provider: "PLIVO",
      isActive: true,
    }),
  };
  const providerFactory = {
    createForWorkspace: jest.fn(),
  };

  const service = new TelephonyService(
    prisma as never,
    orderService as never,
    customerService as never,
    callQueueService as never,
    telephonyConfigService as never,
    providerFactory as never,
  );

  return {
    service,
    prisma,
    orderService,
    customerService,
    callQueueService,
    telephonyConfigService,
    providerFactory,
  };
}

describe("TelephonyService", () => {
  describe("enqueueCall", () => {
    it("enqueues a CallQueue row for an order in the caller's workspace", async () => {
      const { service, callQueueService } = setup();

      const result = await service.enqueueCall(WORKSPACE_ID, {
        orderId: ORDER_ID,
      });

      expect(result).toEqual({ queueId: QUEUE_ID, status: "QUEUED" });
      expect(callQueueService.enqueue).toHaveBeenCalledWith(ORDER_ID);
    });

    it("rejects when the order belongs to a different workspace", async () => {
      const { service, orderService } = setup();
      orderService.getOrderById.mockResolvedValue({
        id: ORDER_ID,
        workspaceId: "other-workspace",
        customerId: CUSTOMER_ID,
      });

      await expect(
        service.enqueueCall(WORKSPACE_ID, { orderId: ORDER_ID }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("createCall", () => {
    it("creates an INITIATED Call row and expedites the queue item", async () => {
      const { service, prisma, callQueueService } = setup();
      prisma.call.create.mockResolvedValue({
        id: "call-1",
        status: CallStatus.INITIATED,
      });

      const result = await service.createCall(WORKSPACE_ID, {
        queueId: QUEUE_ID,
        customerId: CUSTOMER_ID,
      });

      expect(result).toEqual({ callId: "call-1", status: CallStatus.INITIATED });
      expect(prisma.call.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          orderId: ORDER_ID,
          customerId: CUSTOMER_ID,
          callQueueId: QUEUE_ID,
          provider: "PLIVO",
          phoneNumber: "+14155551234",
          status: CallStatus.INITIATED,
          direction: CallDirection.OUTBOUND,
        }),
      });
      expect(callQueueService.expediteNow).toHaveBeenCalledWith(QUEUE_ID);
    });

    it("stores aiAgentId in metadata when provided", async () => {
      const { service, prisma } = setup();
      prisma.call.create.mockResolvedValue({
        id: "call-1",
        status: CallStatus.INITIATED,
      });

      await service.createCall(WORKSPACE_ID, {
        queueId: QUEUE_ID,
        customerId: CUSTOMER_ID,
        aiAgentId: "agent-1",
      });

      expect(prisma.call.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: { aiAgentId: "agent-1" },
        }),
      });
    });

    it("rejects when the queue item's order belongs to a different workspace", async () => {
      const { service, orderService } = setup();
      orderService.getOrderById.mockResolvedValue({
        id: ORDER_ID,
        workspaceId: "other-workspace",
        customerId: CUSTOMER_ID,
      });

      await expect(
        service.createCall(WORKSPACE_ID, {
          queueId: QUEUE_ID,
          customerId: CUSTOMER_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("propagates NotFoundException when the customer does not belong to the caller's workspace", async () => {
      // CustomerService.getCustomerById is workspace-scoped: a customer in
      // another workspace is indistinguishable from a nonexistent one, so
      // it throws NotFoundException itself rather than TelephonyService
      // doing a separate comparison.
      const { service, customerService } = setup();
      customerService.getCustomerById.mockRejectedValue(
        new NotFoundException(`Customer ${CUSTOMER_ID} not found`),
      );

      await expect(
        service.createCall(WORKSPACE_ID, {
          queueId: QUEUE_ID,
          customerId: CUSTOMER_ID,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(customerService.getCustomerById).toHaveBeenCalledWith(
        WORKSPACE_ID,
        CUSTOMER_ID,
      );
    });

    it("rejects when customerId does not match the order's customer", async () => {
      const { service, orderService } = setup();
      orderService.getOrderById.mockResolvedValue({
        id: ORDER_ID,
        workspaceId: WORKSPACE_ID,
        customerId: "a-different-customer",
      });

      await expect(
        service.createCall(WORKSPACE_ID, {
          queueId: QUEUE_ID,
          customerId: CUSTOMER_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws TelephonyConfigMissingError when the workspace has no telephony config", async () => {
      const { service, telephonyConfigService } = setup();
      telephonyConfigService.getActiveConfig.mockResolvedValue(null);

      await expect(
        service.createCall(WORKSPACE_ID, {
          queueId: QUEUE_ID,
          customerId: CUSTOMER_ID,
        }),
      ).rejects.toThrow(TelephonyConfigMissingError);
    });

    it("throws TelephonyProviderInactiveError when the config is inactive", async () => {
      const { service, telephonyConfigService } = setup();
      telephonyConfigService.getActiveConfig.mockResolvedValue({
        provider: "PLIVO",
        isActive: false,
      });

      await expect(
        service.createCall(WORKSPACE_ID, {
          queueId: QUEUE_ID,
          customerId: CUSTOMER_ID,
        }),
      ).rejects.toThrow(TelephonyProviderInactiveError);
    });
  });

  describe("getCallById", () => {
    it("returns the call scoped to the workspace", async () => {
      const { service, prisma } = setup();
      prisma.call.findFirst.mockResolvedValue({ id: "call-1" });

      const result = await service.getCallById(WORKSPACE_ID, "call-1");

      expect(result).toEqual({ id: "call-1" });
      expect(prisma.call.findFirst).toHaveBeenCalledWith({
        where: { id: "call-1", workspaceId: WORKSPACE_ID },
      });
    });

    it("throws NotFoundException when the call does not exist in the workspace", async () => {
      const { service, prisma } = setup();
      prisma.call.findFirst.mockResolvedValue(null);

      await expect(
        service.getCallById(WORKSPACE_ID, "missing"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("listLiveCalls", () => {
    it("maps LiveCallState rows into flat live-call summaries", async () => {
      const { service, prisma } = setup();
      const startedAt = new Date(Date.now() - 45_000);
      prisma.liveCallState.findMany.mockResolvedValue([
        {
          callId: "call-1",
          currentWorkflowNodeKey: "lookup_order_node",
          speakingParty: "AI",
          aiStatus: "SPEAKING",
          lastTranscriptSnippet: "Mera order kahan hai?",
          call: {
            startedAt,
            phoneNumber: "+14155551234",
            customer: { name: "Jane Doe" },
          },
        },
      ]);

      const result = await service.listLiveCalls(WORKSPACE_ID);

      expect(prisma.liveCallState.findMany).toHaveBeenCalledWith({
        where: { workspaceId: WORKSPACE_ID },
        include: { call: { include: { customer: true } } },
      });
      expect(result).toEqual([
        expect.objectContaining({
          callId: "call-1",
          customerName: "Jane Doe",
          phoneNumber: "+14155551234",
          currentWorkflowNodeKey: "lookup_order_node",
          speakingParty: "AI",
          aiStatus: "SPEAKING",
          lastTranscriptSnippet: "Mera order kahan hai?",
          callStartedAt: startedAt.toISOString(),
        }),
      ]);
      expect(result[0].durationSeconds).toBeGreaterThanOrEqual(45);
    });

    it("returns 0 duration and null callStartedAt when the call hasn't started yet", async () => {
      const { service, prisma } = setup();
      prisma.liveCallState.findMany.mockResolvedValue([
        {
          callId: "call-1",
          currentWorkflowNodeKey: null,
          speakingParty: "SILENCE",
          aiStatus: "LISTENING",
          lastTranscriptSnippet: null,
          call: { startedAt: null, phoneNumber: "+14155551234", customer: { name: "Jane Doe" } },
        },
      ]);

      const result = await service.listLiveCalls(WORKSPACE_ID);

      expect(result[0]).toMatchObject({ callStartedAt: null, durationSeconds: 0 });
    });
  });

  describe("listCalls", () => {
    it("scopes to the workspace and paginates", async () => {
      const { service, prisma } = setup();
      prisma.call.findMany.mockResolvedValue([]);
      prisma.call.count.mockResolvedValue(0);

      await service.listCalls(WORKSPACE_ID, { page: 1, limit: 20 }, {});

      expect(prisma.call.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: WORKSPACE_ID },
          include: { customer: true },
        }),
      );
    });

    it("applies status/direction/customerId/search/date-range filters", async () => {
      const { service, prisma } = setup();
      prisma.call.findMany.mockResolvedValue([]);
      prisma.call.count.mockResolvedValue(0);

      await service.listCalls(
        WORKSPACE_ID,
        { page: 1, limit: 20 },
        {
          status: CallStatus.COMPLETED,
          direction: CallDirection.OUTBOUND,
          customerId: CUSTOMER_ID,
          search: "4155",
          dateFrom: "2026-08-01",
          dateTo: "2026-08-05",
        },
      );

      expect(prisma.call.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: WORKSPACE_ID,
            status: CallStatus.COMPLETED,
            direction: CallDirection.OUTBOUND,
            customerId: CUSTOMER_ID,
            phoneNumber: { contains: "4155", mode: "insensitive" },
            startedAt: { gte: new Date("2026-08-01"), lte: new Date("2026-08-05") },
          },
        }),
      );
    });

    it("maps rows to flat, export-ready JSON (customer name flattened, no nested Prisma types)", async () => {
      const { service, prisma } = setup();
      prisma.call.findMany.mockResolvedValue([
        {
          id: "call-1",
          customerId: CUSTOMER_ID,
          customer: { name: "Jane Doe" },
          phoneNumber: "+14155551234",
          status: CallStatus.COMPLETED,
          direction: CallDirection.OUTBOUND,
          provider: "PLIVO",
          startedAt: new Date("2026-08-01T00:00:00Z"),
          answeredAt: new Date("2026-08-01T00:00:05Z"),
          endedAt: new Date("2026-08-01T00:05:00Z"),
          durationSeconds: 295,
          hangupReason: "normal",
          recordingUrl: "https://example.com/rec.mp3",
        },
      ]);
      prisma.call.count.mockResolvedValue(1);

      const result = await service.listCalls(WORKSPACE_ID, { page: 1, limit: 20 }, {});

      expect(result.data[0]).toEqual({
        id: "call-1",
        customerId: CUSTOMER_ID,
        customerName: "Jane Doe",
        phoneNumber: "+14155551234",
        status: CallStatus.COMPLETED,
        direction: CallDirection.OUTBOUND,
        provider: "PLIVO",
        startedAt: "2026-08-01T00:00:00.000Z",
        answeredAt: "2026-08-01T00:00:05.000Z",
        endedAt: "2026-08-01T00:05:00.000Z",
        durationSeconds: 295,
        hangupReason: "normal",
        recordingUrl: "https://example.com/rec.mp3",
      });
      expect(result.meta.total).toBe(1);
    });
  });

  describe("hangupCall", () => {
    it("throws BadRequestException when the call has no providerCallId yet", async () => {
      const { service, prisma } = setup();
      prisma.call.findFirst.mockResolvedValue({
        id: "call-1",
        workspaceId: WORKSPACE_ID,
        providerCallId: null,
      });

      await expect(
        service.hangupCall(WORKSPACE_ID, "call-1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("calls provider.hangup with the providerCallId and does not mutate the row", async () => {
      const { service, prisma, providerFactory } = setup();
      const call = {
        id: "call-1",
        workspaceId: WORKSPACE_ID,
        providerCallId: "call-uuid-1",
      };
      prisma.call.findFirst.mockResolvedValue(call);
      const hangup = jest.fn().mockResolvedValue({ success: true });
      providerFactory.createForWorkspace.mockResolvedValue({ hangup });

      const result = await service.hangupCall(WORKSPACE_ID, "call-1");

      expect(hangup).toHaveBeenCalledWith("call-uuid-1");
      expect(result).toBe(call);
    });
  });
});
