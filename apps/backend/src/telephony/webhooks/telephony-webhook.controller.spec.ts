import { BadRequestException } from "@nestjs/common";
import { TelephonyWebhookSignatureError } from "@ai-voice-automation/telephony-core";

import { TelephonyWebhookController } from "./telephony-webhook.controller";

function fakeReqRes() {
  const req = { originalUrl: "/telephony/webhook?callId=call-1&type=answer", headers: {}, body: {} };
  const res = { setHeader: jest.fn() };
  return { req, res };
}

function setup() {
  const webhookService = { processWebhook: jest.fn() };
  const controller = new TelephonyWebhookController(webhookService as never);
  return { controller, webhookService };
}

describe("TelephonyWebhookController (Sprint 21 error handling)", () => {
  it("400s when callId/type are missing, without ever calling the service", async () => {
    const { controller, webhookService } = setup();
    const { req, res } = fakeReqRes();

    await expect(
      controller.handleWebhook("", "answer", req as never, res as never),
    ).rejects.toThrow(BadRequestException);
    expect(webhookService.processWebhook).not.toHaveBeenCalled();
  });

  it("returns the provider's answer XML on success", async () => {
    const { controller, webhookService } = setup();
    const { req, res } = fakeReqRes();
    webhookService.processWebhook.mockResolvedValue({
      contentType: "text/xml",
      body: "<Response/>",
    });

    const result = await controller.handleWebhook("call-1", "answer", req as never, res as never);

    expect(result).toBe("<Response/>");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/xml");
  });

  it("re-throws a TelephonyError so the shared exception filter keeps its meaningful status mapping", async () => {
    const { controller, webhookService } = setup();
    const { req, res } = fakeReqRes();
    webhookService.processWebhook.mockRejectedValue(
      new TelephonyWebhookSignatureError("bad signature"),
    );

    await expect(
      controller.handleWebhook("call-1", "answer", req as never, res as never),
    ).rejects.toBeInstanceOf(TelephonyWebhookSignatureError);
  });

  it("acks with OK instead of throwing for any other unexpected error (Sprint 21 -- no Plivo retry storm)", async () => {
    const { controller, webhookService } = setup();
    const { req, res } = fakeReqRes();
    webhookService.processWebhook.mockRejectedValue(new Error("db exploded"));

    const result = await controller.handleWebhook("call-1", "answer", req as never, res as never);

    expect(result).toBe("OK");
  });
});
