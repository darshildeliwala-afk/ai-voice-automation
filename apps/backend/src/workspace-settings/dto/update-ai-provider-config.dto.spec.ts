import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { UpdateAiProviderConfigDto } from "./update-ai-provider-config.dto";

async function validateDto(payload: Record<string, unknown>) {
  const instance = plainToInstance(UpdateAiProviderConfigDto, payload);
  return validate(instance);
}

describe("UpdateAiProviderConfigDto validation", () => {
  it("accepts a valid minimal payload", async () => {
    const errors = await validateDto({
      provider: "OPENAI",
      apiKey: "sk-some-key",
    });
    expect(errors).toHaveLength(0);
  });

  it("provider: rejects a value outside the AiProvider enum", async () => {
    const errors = await validateDto({
      provider: "NOT_A_PROVIDER",
      apiKey: "sk-some-key",
    });
    expect(errors.some((e) => e.property === "provider")).toBe(true);
  });

  it("apiKey: is required", async () => {
    const errors = await validateDto({ provider: "OPENAI" });
    expect(errors.some((e) => e.property === "apiKey")).toBe(true);
  });

  it.each([-0.1, 2.1])(
    "temperature: rejects out-of-range value %p",
    async (temperature) => {
      const errors = await validateDto({
        provider: "OPENAI",
        apiKey: "sk-some-key",
        temperature,
      });
      expect(errors.some((e) => e.property === "temperature")).toBe(true);
    },
  );

  it.each([0, 0.7, 2])(
    "temperature: accepts boundary and typical value %p",
    async (temperature) => {
      const errors = await validateDto({
        provider: "OPENAI",
        apiKey: "sk-some-key",
        temperature,
      });
      expect(errors.some((e) => e.property === "temperature")).toBe(false);
    },
  );
});
