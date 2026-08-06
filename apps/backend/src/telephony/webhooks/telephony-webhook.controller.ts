import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { TelephonyError } from "@ai-voice-automation/telephony-core";

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
  private readonly logger = new Logger(TelephonyWebhookController.name);

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

    try {
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
    } catch (error) {
      // TelephonyError keeps its existing, meaningful status-code mapping
      // (TelephonyExceptionFilter) -- e.g. an invalid webhook signature
      // should stay a 400/401, not a silent ack.
      if (error instanceof TelephonyError) {
        throw error;
      }

      // Anything else (an unexpected app/DB error) is logged for
      // visibility but still acked with 200 (Sprint 21): a retry can't
      // fix an application-level bug, and letting Plivo retry-storm a
      // webhook that will fail identically every time only makes things
      // worse. This policy is specific to this public callback endpoint,
      // not the authenticated REST API (see TelephonyExceptionFilter's
      // own doc comment).
      this.logger.error(
        `Webhook processing failed for callId=${callId} type=${type}`,
        error instanceof Error ? error.stack : String(error),
      );
      return "OK";
    }
  }
}
