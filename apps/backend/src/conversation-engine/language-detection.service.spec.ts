import { LanguageDetectionService } from "./language-detection.service";

describe("LanguageDetectionService", () => {
  const service = new LanguageDetectionService();

  it.each([
    ["Hindi mein boliye", { code: "hi", label: "Hindi", supported: true }],
    ["Can we speak in English?", { code: "en", label: "English", supported: true }],
    ["Gujarati bolo", { code: "gu", label: "Gujarati", supported: false }],
  ])("detects %s", (message, expected) => {
    expect(service.detectLanguagePreference(message)).toEqual(expected);
  });

  it("returns null when the message states no explicit language preference", () => {
    expect(
      service.detectLanguagePreference("What's the status of my order?"),
    ).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(service.detectLanguagePreference("HINDI MEIN BOLIYE")).toEqual({
      code: "hi",
      label: "Hindi",
      supported: true,
    });
  });

  it("flags Gujarati as detected but unsupported, not silently dropped", () => {
    const result = service.detectLanguagePreference("Gujarati mein baat karo");

    expect(result).not.toBeNull();
    expect(result?.supported).toBe(false);
  });
});
