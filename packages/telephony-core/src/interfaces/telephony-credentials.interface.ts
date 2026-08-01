export type SupportedTelephonyProvider = "PLIVO";

/**
 * Decrypted, ready-to-use credentials for a workspace's active telephony
 * provider. Callers (apps/backend, apps/worker) are responsible for
 * fetching the raw TelephonyConfig row via their own Prisma client and
 * decrypting `authToken` (see encryption/telephony-encryption.ts) before
 * constructing this -- this package never touches a database.
 */
export interface TelephonyCredentials {
  provider: SupportedTelephonyProvider;
  authId: string;
  /** Decrypted plaintext. Never log or persist this value. */
  authToken: string;
  phoneNumber: string;
}

/**
 * The raw (still-encrypted) shape callers pass into
 * `loadTelephonyCredentials`. Mirrors the subset of the TelephonyConfig
 * Prisma model this package needs -- deliberately not typed against either
 * app's generated Prisma client so the package stays ORM-agnostic.
 */
export interface EncryptedTelephonyConfigRecord {
  provider: SupportedTelephonyProvider;
  authId: string | null;
  /** Still encrypted (ciphertext produced by TelephonyEncryption.encrypt). */
  authToken: string;
  phoneNumber: string | null;
  isActive: boolean;
}
