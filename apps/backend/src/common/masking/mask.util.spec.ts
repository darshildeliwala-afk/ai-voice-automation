import { maskSecret, MASKED_SECRET_VALUE } from "./mask.util";

describe("maskSecret", () => {
  it("returns the fixed placeholder for a non-empty value", () => {
    expect(maskSecret("sk-anything")).toBe(MASKED_SECRET_VALUE);
  });

  it("returns null for null or undefined", () => {
    expect(maskSecret(null)).toBeNull();
    expect(maskSecret(undefined)).toBeNull();
  });

  it("never reveals the original secret's length", () => {
    const short = maskSecret("a");
    const long = maskSecret("a".repeat(500));

    expect(short).toBe(long);
  });

  it("never contains the original value as a substring", () => {
    const secret = "sk-do-not-leak-this";
    expect(maskSecret(secret)).not.toContain(secret);
  });
});
