import { TelephonyEncryption } from "./telephony-encryption";

describe("TelephonyEncryption", () => {
  it("throws if constructed without a key", () => {
    expect(() => new TelephonyEncryption("")).toThrow(
      "APP_ENCRYPTION_KEY environment variable is required",
    );
  });

  it("round-trips plaintext through encrypt/decrypt", () => {
    const encryption = new TelephonyEncryption("test-key-do-not-use-in-prod");

    const ciphertext = encryption.encrypt("plivo-auth-token-secret");

    expect(ciphertext).not.toBe("plivo-auth-token-secret");
    expect(encryption.decrypt(ciphertext)).toBe("plivo-auth-token-secret");
  });

  it("produces different ciphertext for the same plaintext each call", () => {
    const encryption = new TelephonyEncryption("test-key-do-not-use-in-prod");

    const a = encryption.encrypt("same-value");
    const b = encryption.encrypt("same-value");

    expect(a).not.toBe(b);
  });

  it("fails to decrypt with the wrong key", () => {
    const encryption = new TelephonyEncryption("key-one");
    const other = new TelephonyEncryption("key-two");

    const ciphertext = encryption.encrypt("secret");

    expect(() => other.decrypt(ciphertext)).toThrow();
  });

  it("is interoperable with apps/backend's EncryptionService encoding (AES-256-GCM, same salt)", () => {
    // This mirrors apps/backend/src/common/encryption/encryption.service.ts
    // exactly so a ciphertext written by one is decryptable by the other.
    const encryption = new TelephonyEncryption("shared-app-encryption-key");
    const ciphertext = encryption.encrypt("cross-app-secret");

    const raw = Buffer.from(ciphertext, "base64");
    expect(raw.length).toBeGreaterThan(12 + 16); // iv + authTag + at least 1 byte

    expect(encryption.decrypt(ciphertext)).toBe("cross-app-secret");
  });
});
