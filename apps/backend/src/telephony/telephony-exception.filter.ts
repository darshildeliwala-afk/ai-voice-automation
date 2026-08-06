import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import { TelephonyError } from "@ai-voice-automation/telephony-core";

const STATUS_BY_CODE: Record<string, HttpStatus> = {
  TELEPHONY_CONFIG_MISSING: HttpStatus.NOT_FOUND,
  TELEPHONY_PROVIDER_INACTIVE: HttpStatus.CONFLICT,
  TELEPHONY_INVALID_CREDENTIALS: HttpStatus.BAD_GATEWAY,
  TELEPHONY_PROVIDER_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  TELEPHONY_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  TELEPHONY_PROVIDER_API_ERROR: HttpStatus.BAD_GATEWAY,
  TELEPHONY_WEBHOOK_SIGNATURE_INVALID: HttpStatus.BAD_REQUEST,
  TELEPHONY_WEBHOOK_REPLAY: HttpStatus.CONFLICT,
};

/**
 * Translates the framework-agnostic TelephonyError hierarchy (thrown by
 * @ai-voice-automation/telephony-core, which has no @nestjs/common
 * dependency) into meaningful HTTP status codes for the REST API. Scoped
 * to the telephony controllers only via @UseFilters -- no other module
 * throws TelephonyError. Shared by both TelephonyController (the
 * authenticated REST API, where a genuinely unexpected error should
 * still surface as a real 5xx to the caller) and TelephonyWebhookController
 * (the public Plivo callback, which has its own additional catch-all --
 * see handleWebhook() -- since an unexpected failure there should be
 * acked rather than risk a Plivo retry storm; that policy is specific to
 * the webhook, so it isn't baked into this shared filter).
 */
@Catch(TelephonyError)
export class TelephonyExceptionFilter implements ExceptionFilter {
  catch(exception: TelephonyError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.BAD_GATEWAY;

    response.status(status).json({
      statusCode: status,
      code: exception.code,
      message: exception.message,
    });
  }
}
