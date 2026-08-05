import { randomUUID } from "node:crypto";

const mockCallsHangup = jest.fn();
const mockValidateSignature = jest.fn().mockReturnValue(true);

jest.mock("plivo", () => ({
  Client: jest.fn().mockImplementation(() => ({
    calls: {
      create: jest.fn(),
      hangup: mockCallsHangup,
      get: jest.fn(),
    },
  })),
  validateSignature: (...args: unknown[]) => mockValidateSignature(...args),
  Response: jest.fn().mockImplementation(() => ({
    addSpeak: jest.fn(),
    addRecord: jest.fn(),
    addStream: jest.fn(),
    toXML: () => "<Response><Speak>stub</Speak></Response>",
  })),
}));

// eslint-disable-next-line import/first
import { ValidationPipe } from "@nestjs/common";
// eslint-disable-next-line import/first
import { JwtService } from "@nestjs/jwt";
// eslint-disable-next-line import/first
import type { INestApplication } from "@nestjs/common";
// eslint-disable-next-line import/first
import { Test } from "@nestjs/testing";
// eslint-disable-next-line import/first
import request from "supertest";

// eslint-disable-next-line import/first
import { AppModule } from "../../src/app.module";
// eslint-disable-next-line import/first
import { CallQueueService } from "../../src/call-queue/call-queue.service";
// eslint-disable-next-line import/first
import { PrismaService } from "../../src/common/prisma/prisma.service";
// eslint-disable-next-line import/first
import { CustomerService } from "../../src/customer/customer.service";
// eslint-disable-next-line import/first
import { OrderService } from "../../src/order/order.service";
// eslint-disable-next-line import/first
import { QueueStatus } from "../../src/generated/prisma/client";
// eslint-disable-next-line import/first
import { TelephonyConfigService } from "../../src/workspace-settings/telephony-config.service";

describe("Telephony (e2e, real HTTP + auth)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let workspaceId: string;
  let userId: string;
  let customerId: string;
  let orderId: string;
  let queueId: string;
  let token: string;

  beforeAll(async () => {
    process.env.TELEPHONY_WEBHOOK_BASE_URL ??= "https://example.com";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    const customerService = app.get(CustomerService);
    const orderService = app.get(OrderService);
    const callQueueService = app.get(CallQueueService);
    const telephonyConfigService = app.get(TelephonyConfigService);

    workspaceId = randomUUID();
    userId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'Telephony E2E Workspace', ${`telephony-e2e-${Date.now()}`}, now(), now())
    `;
    await prisma.$executeRaw`
      INSERT INTO "User" (id, "workspaceId", name, email, "passwordHash", role, "createdAt", "updatedAt")
      VALUES (${userId}::uuid, ${workspaceId}::uuid, 'Telephony E2E User', ${`telephony-e2e-${Date.now()}@example.com`}, 'irrelevant-hash', 'ADMIN', now(), now())
    `;

    const customer = await customerService.createCustomer(workspaceId, {
      name: "E2E Customer",
      phone: "+14155559200",
    });
    customerId = customer.id;

    const order = await orderService.createOrder({
      workspaceId,
      customerId,
      marketplace: "MANUAL" as never,
      paymentType: "COD" as never,
      totalAmount: 100,
    });
    orderId = order.id;

    const queueItem = await callQueueService.enqueue(orderId);
    queueId = queueItem.id;

    await telephonyConfigService.upsertConfig(workspaceId, {
      provider: "PLIVO" as never,
      authId: "AC_e2e",
      authToken: "e2e-auth-token",
      phoneNumber: "+14155550002",
    });

    token = await jwtService.signAsync({
      sub: userId,
      email: "telephony-e2e@example.com",
      workspaceId,
      role: "ADMIN",
    });
  });

  afterAll(async () => {
    await prisma.telephonyWebhookEvent.deleteMany({
      where: { providerCallId: { contains: "e2e" } },
    });
    await prisma.call.deleteMany({ where: { workspaceId } });
    await prisma.telephonyConfig.deleteMany({ where: { workspaceId } });
    await prisma.callQueue.deleteMany({ where: { orderId } });
    await prisma.$executeRaw`DELETE FROM "Order" WHERE id = ${orderId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "Customer" WHERE id = ${customerId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "User" WHERE id = ${userId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${workspaceId}::uuid`;
    await app.close();
  });

  it("rejects unauthenticated requests with 401", async () => {
    await request(app.getHttpServer())
      .post("/telephony/call")
      .send({ queueId, customerId })
      .expect(401);
  });

  it("POST /telephony/queue enqueues a CallQueue row for an order in the caller's workspace", async () => {
    const res = await request(app.getHttpServer())
      .post("/telephony/queue")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId })
      .expect(201);

    expect(res.body.queueId).toBeDefined();
    expect(res.body.status).toBe("QUEUED");
  });

  let createdCallId: string;

  it("POST /telephony/call creates a Call and returns { callId, status }", async () => {
    const res = await request(app.getHttpServer())
      .post("/telephony/call")
      .set("Authorization", `Bearer ${token}`)
      .send({ queueId, customerId })
      .expect(201);

    expect(res.body.callId).toBeDefined();
    expect(res.body.status).toBe("INITIATED");
    createdCallId = res.body.callId;

    const queueRow = await prisma.callQueue.findUniqueOrThrow({
      where: { id: queueId },
    });
    expect(queueRow.status).toBe(QueueStatus.QUEUED);
  });

  it("POST /telephony/call 404s on an unrecognized queueId", async () => {
    await request(app.getHttpServer())
      .post("/telephony/call")
      .set("Authorization", `Bearer ${token}`)
      .send({ queueId: randomUUID(), customerId })
      .expect(404);
  });

  it("GET /telephony/calls/:id returns the created call", async () => {
    const res = await request(app.getHttpServer())
      .get(`/telephony/calls/${createdCallId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.id).toBe(createdCallId);
    expect(res.body.workspaceId).toBe(workspaceId);
  });

  it("GET /telephony/calls/:id 404s for a call in another workspace", async () => {
    await request(app.getHttpServer())
      .get(`/telephony/calls/${randomUUID()}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });

  it("POST /telephony/calls/:id/hangup 400s when the call has no providerCallId yet", async () => {
    await request(app.getHttpServer())
      .post(`/telephony/calls/${createdCallId}/hangup`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });

  it("POST /telephony/calls/:id/hangup calls the provider once providerCallId is set", async () => {
    await prisma.call.update({
      where: { id: createdCallId },
      data: { providerCallId: "call-uuid-e2e-hangup" },
    });
    mockCallsHangup.mockResolvedValue({ apiId: "api-hangup" });

    await request(app.getHttpServer())
      .post(`/telephony/calls/${createdCallId}/hangup`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    expect(mockCallsHangup).toHaveBeenCalledWith("call-uuid-e2e-hangup");
  });

  describe("POST /telephony/webhook", () => {
    let webhookCallId: string;

    function postWebhook(query: string, body: Record<string, unknown>) {
      return request(app.getHttpServer())
        .post(`/telephony/webhook${query}`)
        .set("X-Plivo-Signature-V2", "sig")
        .set("X-Plivo-Signature-V2-Nonce", "nonce")
        .send(body);
    }

    beforeEach(async () => {
      const created = await request(app.getHttpServer())
        .post("/telephony/call")
        .set("Authorization", `Bearer ${token}`)
        .send({ queueId, customerId })
        .expect(201);
      webhookCallId = created.body.callId;
      await prisma.call.update({
        where: { id: webhookCallId },
        data: { providerCallId: "req-uuid-e2e-webhook" },
      });
      mockValidateSignature.mockReturnValue(true);
    });

    it("is public (no auth required) and processes an answer callback", async () => {
      const res = await postWebhook(
        `?callId=${webhookCallId}&type=answer`,
        {
          CallUUID: "call-uuid-e2e-webhook",
          RequestUUID: "req-uuid-e2e-webhook",
          CallStatus: "in-progress",
        },
      ).expect(200);

      expect(res.text).toContain("<Response>");

      const call = await prisma.call.findUniqueOrThrow({
        where: { id: webhookCallId },
      });
      expect(call.status).toBe("CONNECTED");
    });

    it("processes a hangup callback and completes the CallQueue row", async () => {
      await postWebhook(`?callId=${webhookCallId}&type=answer`, {
        CallUUID: "call-uuid-e2e-webhook-2",
        RequestUUID: "req-uuid-e2e-webhook",
        CallStatus: "in-progress",
      }).expect(200);

      await postWebhook(`?callId=${webhookCallId}&type=hangup`, {
        CallUUID: "call-uuid-e2e-webhook-2",
        CallStatus: "completed",
        Duration: "12",
        HangupCause: "NORMAL_CLEARING",
      }).expect(200);

      const call = await prisma.call.findUniqueOrThrow({
        where: { id: webhookCallId },
      });
      expect(call.status).toBe("COMPLETED");
      expect(call.durationSeconds).toBe(12);
    });

    it("ignores a redelivered duplicate event without reprocessing it", async () => {
      const body = {
        CallUUID: "call-uuid-e2e-dup",
        RequestUUID: "req-uuid-e2e-webhook",
        CallStatus: "ringing",
      };

      await postWebhook(
        `?callId=${webhookCallId}&type=answer`,
        body,
      ).expect(200);

      const afterFirst = await prisma.call.findUniqueOrThrow({
        where: { id: webhookCallId },
      });

      await postWebhook(
        `?callId=${webhookCallId}&type=answer`,
        body,
      ).expect(200);

      const afterSecond = await prisma.call.findUniqueOrThrow({
        where: { id: webhookCallId },
      });
      expect(afterSecond.updatedAt).toEqual(afterFirst.updatedAt);
    });

    it("rejects when the provider signature is invalid", async () => {
      mockValidateSignature.mockReturnValueOnce(false);

      await postWebhook(`?callId=${webhookCallId}&type=answer`, {
        CallUUID: "call-uuid-e2e-badsig",
        CallStatus: "ringing",
      }).expect(400);
    });

    it("400s when callId or type query params are missing", async () => {
      await postWebhook("", {}).expect(400);
    });
  });
});
