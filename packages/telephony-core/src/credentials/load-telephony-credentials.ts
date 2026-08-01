import { TelephonyEncryption } from "../encryption/telephony-encryption";
import {
  TelephonyConfigMissingError,
  TelephonyProviderInactiveError,
} from "../errors/telephony.errors";
import type {
  EncryptedTelephonyConfigRecord,
  TelephonyCredentials,
} from "../interfaces/telephony-credentials.interface";

/**
 * Turns a raw TelephonyConfig row (as fetched by the caller's own Prisma
 * client -- this package never queries a database) into decrypted,
 * ready-to-use credentials. Callers pass `null` when no row was found at
 * all, so the "missing" vs "inactive" distinction produces the right
 * error either way.
 */
export function loadTelephonyCredentials(
  workspaceId: string,
  config: EncryptedTelephonyConfigRecord | null,
  encryption: TelephonyEncryption,
): TelephonyCredentials {
  if (!config) {
    throw new TelephonyConfigMissingError(workspaceId);
  }

  if (!config.isActive) {
    throw new TelephonyProviderInactiveError(workspaceId);
  }

  if (!config.authId || !config.phoneNumber) {
    throw new TelephonyConfigMissingError(workspaceId);
  }

  return {
    provider: config.provider,
    authId: config.authId,
    authToken: encryption.decrypt(config.authToken),
    phoneNumber: config.phoneNumber,
  };
}
