import { EncryptionService } from "./encryption.service";

const ORIGINAL_ENV = process.env.APP_ENCRYPTION_KEY;

describe("EncryptionService", () => {
  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key-do-not-use-in-prod";
  });

  afterAll(() => {
    process.env.APP_ENCRYPTION_KEY = ORIGINAL_ENV;
  });

  it("throws at construction if APP_ENCRYPTION_KEY is missing", () => {
    delete process.env.APP_ENCRYPTION_KEY;
    expect(() => new EncryptionService()).toThrow(
      "APP_ENCRYPTION_KEY environment variable is required",
    );
  });

  it("round-trips plaintext through encrypt/decrypt", () => {
    const service = new EncryptionService();
    const plaintext = "sk-super-secret-api-key-123";

    const ciphertext = service.encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext).not.toContain(plaintext);

    expect(service.decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext each call (random IV)", () => {
    const service = new EncryptionService();
    const plaintext = "same-value";

    const first = service.encrypt(plaintext);
    const second = service.encrypt(plaintext);

    expect(first).not.toBe(second);
    expect(service.decrypt(first)).toBe(plaintext);
    expect(service.decrypt(second)).toBe(plaintext);
  });

  it("throws when decrypting a tampered ciphertext (GCM auth tag integrity)", () => {
    const service = new EncryptionService();
    const ciphertext = service.encrypt("integrity-check");

    const raw = Buffer.from(ciphertext, "base64");
    raw[raw.length - 1] ^= 0xff; // flip a bit in the encrypted payload
    const tampered = raw.toString("base64");

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it("cannot decrypt with a different key", () => {
    const service = new EncryptionService();
    const ciphertext = service.encrypt("cross-key-check");

    process.env.APP_ENCRYPTION_KEY = "a-completely-different-key";
    const otherService = new EncryptionService();

    expect(() => otherService.decrypt(ciphertext)).toThrow();
  });
});
