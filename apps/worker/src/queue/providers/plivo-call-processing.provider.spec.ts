const mockCallsCreate = jest.fn();

jest.mock("plivo", () => ({
  Client: jest.fn().mockImplementation(() => ({
    calls: { create: mockCallsCreate, hangup: jest.fn(), get: jest.fn() },
  })),
  validateSignature: jest.fn(),
  Response: jest.fn(),
}));

// eslint-disable-next-line import/first
import { TelephonyEncryption } from "@ai-voice-automation/telephony-core";

// eslint-disable-next-line import/first
import { CallDirection, CallStatus } from "../../generated/prisma/client";
// eslint-disable-next-line import/first
import { PlivoCallProcessingProvider } from "./plivo-call-processing.provider";

const WORKSPACE_ID = "workspace-1";
const ORDER_ID = "order-1";
const CUSTOMER_ID = "customer-1";
const QUEUE_ID = "queue-1";

function setup() {
  const encryption = new TelephonyEncryption("test-key-do-not-use-in-prod");

  const order = { findUnique: jest.fn() };
  const customer = { findUnique: jest.fn() };
  const call = {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  };
  const telephonyConfig = { findFirst: jest.fn() };
  const prisma = { order, customer, call, telephonyConfig };

  const logger = { event: jest.fn(), eventError: jest.fn() };

  const provider = new PlivoCallProcessingProvider(
    prisma as never,
    encryption as never,
    logger as never,
  );

  return { provider, prisma, order, customer, call, telephonyConfig, encryption, logger };
}

function queueJob(overrides: Record<string, unknown> = {}) {
  return {
    id: QUEUE_ID,
    orderId: ORDER_ID,
    aiAgentId: null,
    ...overrides,
  } as never;
}

describe("PlivoCallProcessingProvider", () => {
  beforeEach(() => {
    mockCallsCreate.mockReset();
  });

  it("returns failure when the order does not exist", async () => {
    const { provider, order } = setup();
    order.findUnique.mockResolvedValue(null);

    const result = await provider.process(queueJob());

    expect(result.success).toBe(false);
    expect(result.message).toContain(ORDER_ID);
  });

  it("returns failure when the customer does not exist", async () => {
    const { provider, order, customer } = setup();
    order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });
    customer.findUnique.mockResolvedValue(null);

    const result = await provider.process(queueJob());

    expect(result.success).toBe(false);
    expect(result.message).toContain(CUSTOMER_ID);
  });

  describe("with a resolvable order and customer", () => {
    function setupResolvable() {
      const ctx = setup();
      ctx.order.findUnique.mockResolvedValue({
        id: ORDER_ID,
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
      });
      ctx.customer.findUnique.mockResolvedValue({
        id: CUSTOMER_ID,
        phone: "+14155551234",
      });
      return ctx;
    }

    it("returns failure (no throw) when no active telephony config exists", async () => {
      const { provider, telephonyConfig, call } = setupResolvable();
      telephonyConfig.findFirst.mockResolvedValue(null);
      call.findFirst.mockResolvedValue(null);

      const result = await provider.process(queueJob());

      expect(result.success).toBe(false);
      expect(result.message).toContain(WORKSPACE_ID);
    });

    it("creates a Call row, places the call, and persists providerCallId + RINGING", async () => {
      const { provider, telephonyConfig, call, encryption } =
        setupResolvable();
      call.findFirst.mockResolvedValue(null);
      telephonyConfig.findFirst.mockResolvedValue({
        provider: "PLIVO",
        authId: "AC_test",
        authToken: encryption.encrypt("plain-auth-token"),
        phoneNumber: "+14155550000",
        isActive: true,
      });
      call.create.mockResolvedValue({
        id: "call-1",
        workspaceId: WORKSPACE_ID,
        orderId: ORDER_ID,
        customerId: CUSTOMER_ID,
        callQueueId: QUEUE_ID,
        provider: "PLIVO",
        phoneNumber: "+14155551234",
        status: CallStatus.INITIATED,
        direction: CallDirection.OUTBOUND,
        providerCallId: null,
      });
      mockCallsCreate.mockResolvedValue({
        apiId: "api-1",
        message: "call fired",
        requestUuid: "req-uuid-1",
      });

      const result = await provider.process(queueJob());

      expect(result.success).toBe(true);
      expect(call.create).toHaveBeenCalledWith({
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
      expect(mockCallsCreate).toHaveBeenCalledWith(
        "14155550000",
        "14155551234",
        expect.stringContaining("callId=call-1"),
        expect.objectContaining({
          hangupUrl: expect.stringContaining("callId=call-1"),
        }),
      );
      expect(call.update).toHaveBeenCalledWith({
        where: { id: "call-1" },
        data: expect.objectContaining({
          providerCallId: "req-uuid-1",
          status: CallStatus.RINGING,
        }),
      });
    });

    it("never sends the plaintext or encrypted authToken to Plivo's `to`/`from` fields (sanity: only phone numbers)", async () => {
      const { provider, telephonyConfig, call, encryption } =
        setupResolvable();
      call.findFirst.mockResolvedValue(null);
      const encryptedToken = encryption.encrypt("super-secret-token");
      telephonyConfig.findFirst.mockResolvedValue({
        provider: "PLIVO",
        authId: "AC_test",
        authToken: encryptedToken,
        phoneNumber: "+14155550000",
        isActive: true,
      });
      call.create.mockResolvedValue({ id: "call-2" });
      mockCallsCreate.mockResolvedValue({
        apiId: "api-1",
        message: "call fired",
        requestUuid: "req-uuid-2",
      });

      await provider.process(queueJob());

      const [from, to] = mockCallsCreate.mock.calls[0];
      expect(from).not.toContain("secret");
      expect(to).not.toContain("secret");
    });

    it("skips re-dialing and returns success when the Call already has a providerCallId", async () => {
      const { provider, telephonyConfig, call } = setupResolvable();
      call.findFirst.mockResolvedValue({
        id: "call-existing",
        providerCallId: "already-placed-uuid",
      });

      const result = await provider.process(queueJob());

      expect(result.success).toBe(true);
      expect(telephonyConfig.findFirst).not.toHaveBeenCalled();
      expect(mockCallsCreate).not.toHaveBeenCalled();
      expect(call.create).not.toHaveBeenCalled();
    });

    it("marks the Call FAILED and returns failure when the provider API call throws", async () => {
      const { provider, telephonyConfig, call, encryption } =
        setupResolvable();
      call.findFirst.mockResolvedValue(null);
      telephonyConfig.findFirst.mockResolvedValue({
        provider: "PLIVO",
        authId: "AC_test",
        authToken: encryption.encrypt("plain-auth-token"),
        phoneNumber: "+14155550000",
        isActive: true,
      });
      call.create.mockResolvedValue({ id: "call-3", providerCallId: null });
      mockCallsCreate.mockRejectedValue({ status: 401 });

      const result = await provider.process(queueJob());

      expect(result.success).toBe(false);
      expect(call.update).toHaveBeenCalledWith({
        where: { id: "call-3" },
        data: expect.objectContaining({ status: CallStatus.FAILED }),
      });
    });
  });
});
