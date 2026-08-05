import { normalizeTag } from "./tag-normalizer";

describe("normalizeTag", () => {
  it.each([
    ["Hot Lead", "Hot Lead"],
    ["hot lead", "Hot Lead"],
    ["HOT LEAD", "Hot Lead"],
    ["  hot   lead  ", "Hot Lead"],
    ["VIP", "Vip"],
    ["needs callback", "Needs Callback"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeTag(input)).toBe(expected);
  });

  it("produces the same output regardless of input casing", () => {
    expect(normalizeTag("Hot Lead")).toBe(normalizeTag("hot lead"));
    expect(normalizeTag("Hot Lead")).toBe(normalizeTag("HOT LEAD"));
  });
});
