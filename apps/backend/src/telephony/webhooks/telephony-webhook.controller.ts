import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { TelephonyExceptionFilter } from "../telephony-exception.filter";
import { TelephonyWebhookService } from "./telephony-webhook.service";

/**
 * Public endpoint (no JwtAuthGuard) -- Plivo cannot present a JWT.
 * Authenticity is instead established per-request via the provider's own
 * webhook signature (see TelephonyWebhookService/PlivoProvider.validateWebhook).
 */
@Controller("telephony/webhook")
@UseFilters(TelephonyExceptionFilter)
export class TelephonyWebhookController {
  constructor(private readonly webhookService: TelephonyWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Query("callId") callId: string,
    @Query("type") type: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    if (!callId || (type !== "answer" && type !== "hangup")) {
      throw new BadRequestException(
        "callId and a valid type (answer|hangup) query params are required",
      );
    }

    const baseUrl = (process.env.TELEPHONY_WEBHOOK_BASE_URL ?? "").replace(
      /\/$/,
      "",
    );

    const response = await this.webhookService.processWebhook({
      callId,
      type,
      url: `${baseUrl}${req.originalUrl}`,
      headers: req.headers,
      body: req.body as Record<string, unknown>,
    });

    if (response) {
      res.setHeader("Content-Type", response.contentType);
      return response.body;
    }

    return "OK";
  }
}
