import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;
const KEY_DERIVATION_SALT = "workspace-settings-encryption";

/**
 * AES-256-GCM encrypt/decrypt for TelephonyConfig.authToken. This
 * INTENTIONALLY mirrors apps/backend's EncryptionService byte-for-byte
 * (same algorithm, IV/tag lengths, key-derivation salt, and
 * base64(iv + authTag + ciphertext) encoding) so ciphertext written by one
 * is always decryptable by the other -- both read/write the same
 * TelephonyConfig rows. Do not change this independently of
 * apps/backend/src/common/encryption/encryption.service.ts.
 */
export class TelephonyEncryption {
  private readonly key: Buffer;

  constructor(appEncryptionKey: string) {
    if (!appEncryptionKey) {
      throw new Error("APP_ENCRYPTION_KEY environment variable is required");
    }

    this.key = scryptSync(appEncryptionKey, KEY_DERIVATION_SALT, KEY_LENGTH);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
  }

  decrypt(ciphertext: string): string {
    const raw = Buffer.from(ciphertext, "base64");

    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  }
}
