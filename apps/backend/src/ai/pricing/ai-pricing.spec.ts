import { AiProvider } from "../../generated/prisma/client";
import { estimateCost } from "./ai-pricing";

describe("estimateCost", () => {
  it("computes cost from the known per-model rate table", () => {
    const cost = estimateCost(AiProvider.OPENAI, "gpt-4o-mini", 1_000_000, 1_000_000);

    // 1M prompt tokens @ $0.15/M + 1M completion tokens @ $0.60/M
    expect(cost).toBeCloseTo(0.75, 6);
  });

  it("scales linearly with token count", () => {
    const small = estimateCost(AiProvider.OPENAI, "gpt-4o-mini", 1_000, 500);
    const large = estimateCost(AiProvider.OPENAI, "gpt-4o-mini", 10_000, 5_000);

    expect(large).toBeCloseTo(small * 10, 6);
  });

  it("falls back to the default rate for an unlisted model", () => {
    const known = estimateCost(AiProvider.OPENAI, "gpt-4o-mini", 1_000_000, 0);
    const unknown = estimateCost(
      AiProvider.OPENAI,
      "some-future-model-not-in-table",
      1_000_000,
      0,
    );

    expect(unknown).not.toBe(known);
    expect(unknown).toBeGreaterThan(0);
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateCost(AiProvider.OPENAI, "gpt-4o-mini", 0, 0)).toBe(0);
  });

  it("never returns a negative cost", () => {
    const cost = estimateCost(AiProvider.ANTHROPIC, "claude-not-in-table", 1, 1);
    expect(cost).toBeGreaterThanOrEqual(0);
  });
});
