import { Injectable } from "@nestjs/common";
import { TelephonyEncryption } from "@ai-voice-automation/telephony-core";

/**
 * NestJS-injectable wrapper around the shared TelephonyEncryption class so
 * it participates in DI (and fails fast at bootstrap if APP_ENCRYPTION_KEY
 * is missing, matching apps/backend's EncryptionService). The algorithm
 * itself lives in @ai-voice-automation/telephony-core -- this file adds
 * nothing but the @Injectable() wiring.
 */
@Injectable()
export class TelephonyEncryptionProvider extends TelephonyEncryption {
  constructor() {
    super(process.env.APP_ENCRYPTION_KEY ?? "");
  }
}
